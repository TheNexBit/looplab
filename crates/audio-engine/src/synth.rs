//! Synth over the track: the notes of a score (a Guitar Pro tab) played with the recording.
//!
//! The notes are given in track frames; the reader queues them as it reads, like the clicks,
//! so they are heard exactly where they fall in the recording at any speed and across loop
//! wraps. Each note is a few decaying harmonics (a soft plucked sound, exact pitch), built with
//! rotating phasors: no `sin` per sample, nothing allocated on the audio thread.

/// A note of the score, in track frames.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Note {
    /// First frame of the track where it is heard
    pub start: u64,
    /// Frames it lasts in the track (at speed 1)
    pub length: u64,
    /// MIDI note number (60 = middle C), fractional for a transposition in cents
    pub midi: f32,
    /// 0..1
    pub velocity: f32,
}

/// What the synth plays: `level` 0 is off (no notes are even queued).
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SynthSettings {
    /// 0..1
    pub level: f32,
}

/// Simultaneous notes; the oldest one makes room for a new one past this.
const VOICES: usize = 16;
/// Relative amplitude of the harmonics.
const HARMONICS: [f32; 5] = [1.0, 0.45, 0.25, 0.14, 0.08];
/// Seconds for the fundamental to fall by 1/e; higher harmonics fall faster.
const DECAY_SECONDS: f32 = 0.9;
const ATTACK_SECONDS: f32 = 0.004;
const RELEASE_SECONDS: f32 = 0.06;
/// Notes are never held longer than this (seconds), however long they are written.
const MAX_SECONDS: f32 = 4.0;
/// Keeps a full chord below full scale.
const HEADROOM: f32 = 0.16;
/// Pending notes the reader can queue (a strummed 7-string chord fits many times over).
const QUEUE: usize = 128;

#[derive(Clone, Copy, Default)]
struct Pending {
    fed: u64,
    length: u64,
    midi: f32,
    velocity: f32,
}

/// Notes found by the reader, oldest first: the input frame (stretcher feed count) they belong to.
pub(crate) struct NoteQueue {
    items: [Pending; QUEUE],
    head: usize,
    len: usize,
}

impl NoteQueue {
    pub fn new() -> Self {
        Self {
            items: [Pending::default(); QUEUE],
            head: 0,
            len: 0,
        }
    }

    /// Queues a note; dropped when the queue is full.
    pub fn push(&mut self, fed: u64, note: &Note) {
        if self.len < QUEUE {
            self.items[(self.head + self.len) % QUEUE] = Pending {
                fed,
                length: note.length,
                midi: note.midi,
                velocity: note.velocity,
            };
            self.len += 1;
        }
    }

    fn pop_due(&mut self, heard_fed: f64) -> Option<Pending> {
        if self.len == 0 {
            return None;
        }
        let first = self.items[self.head];
        if first.fed as f64 > heard_fed {
            return None;
        }
        self.head = (self.head + 1) % QUEUE;
        self.len -= 1;
        Some(first)
    }

    pub fn clear(&mut self) {
        self.head = 0;
        self.len = 0;
    }
}

#[derive(Clone, Copy, Default)]
struct Voice {
    active: bool,
    /// Started at this count of rendered frames (the oldest is replaced first)
    born: u64,
    /// Phasor of each harmonic: (cos, sin) and its rotation per frame
    re: [f32; HARMONICS.len()],
    im: [f32; HARMONICS.len()],
    rot_re: [f32; HARMONICS.len()],
    rot_im: [f32; HARMONICS.len()],
    /// Amplitude of each harmonic and its decay per frame
    amp: [f32; HARMONICS.len()],
    decay: [f32; HARMONICS.len()],
    /// Envelope: rises over the attack, falls over the release
    env: f32,
    attack_step: f32,
    /// Frames before the release starts
    hold: u64,
    releasing: bool,
}

/// The synth's voices, mixed into one signal.
pub(crate) struct Synth {
    sample_rate: f32,
    level: f32,
    voices: [Voice; VOICES],
    queue: NoteQueue,
    clock: u64,
    release_step: f32,
}

impl Synth {
    pub fn new(sample_rate: u32) -> Self {
        let rate = sample_rate.max(1) as f32;
        Self {
            sample_rate: rate,
            level: 0.0,
            voices: [Voice::default(); VOICES],
            queue: NoteQueue::new(),
            clock: 0,
            release_step: 1.0 / (RELEASE_SECONDS * rate).max(1.0),
        }
    }

    pub fn set(&mut self, settings: SynthSettings) {
        self.level = settings.level.clamp(0.0, 1.0);
        if self.level == 0.0 {
            self.stop();
        }
    }

    pub fn is_on(&self) -> bool {
        self.level > 0.0
    }

    pub fn queue(&mut self) -> &mut NoteQueue {
        &mut self.queue
    }

    /// Silences every note at once (a seek: what was ringing belongs elsewhere).
    pub fn stop(&mut self) {
        self.queue.clear();
        for voice in &mut self.voices {
            voice.active = false;
        }
    }

    /// Lets the ringing notes fade (pause), dropping the ones not heard yet.
    pub fn release(&mut self) {
        self.queue.clear();
        for voice in &mut self.voices {
            voice.releasing = true;
        }
    }

    /// Starts the notes due at `heard_fed`; `speed` stretches how long they are held.
    pub fn start_due(&mut self, heard_fed: f64, speed: f32) {
        while let Some(note) = self.queue.pop_due(heard_fed) {
            self.start(note, speed);
        }
    }

    fn start(&mut self, note: Pending, speed: f32) {
        let hz = 440.0 * 2f32.powf((note.midi - 69.0) / 12.0);
        let nyquist = self.sample_rate * 0.45;
        let slot = self
            .voices
            .iter()
            .position(|v| !v.active)
            .unwrap_or_else(|| {
                // The oldest note makes room
                let mut oldest = 0;
                for (i, v) in self.voices.iter().enumerate() {
                    if v.born < self.voices[oldest].born {
                        oldest = i;
                    }
                }
                oldest
            });
        let rate = self.sample_rate;
        let max_hold = (MAX_SECONDS * rate) as u64;
        let held = (note.length as f32 / speed.max(0.05)) as u64;
        let voice = &mut self.voices[slot];
        *voice = Voice {
            active: true,
            born: self.clock,
            attack_step: 1.0 / (ATTACK_SECONDS * rate).max(1.0),
            hold: held.clamp(1, max_hold),
            ..Voice::default()
        };
        let velocity = note.velocity.clamp(0.05, 1.0);
        for (k, &amplitude) in HARMONICS.iter().enumerate() {
            let f = hz * (k + 1) as f32;
            if f >= nyquist {
                continue;
            }
            let w = std::f32::consts::TAU * f / rate;
            voice.re[k] = 1.0;
            voice.im[k] = 0.0;
            voice.rot_re[k] = w.cos();
            voice.rot_im[k] = w.sin();
            voice.amp[k] = amplitude * velocity;
            // Higher harmonics and higher notes fade sooner, like a string
            let seconds = DECAY_SECONDS / (1.0 + k as f32 * 0.8) * (220.0 / hz).clamp(0.35, 2.0);
            voice.decay[k] = (-1.0 / (seconds * rate)).exp();
        }
    }

    /// Next output sample (0 when off or silent).
    #[inline]
    pub fn next(&mut self) -> f32 {
        self.clock += 1;
        if self.level == 0.0 {
            return 0.0;
        }
        let renormalize = self.clock.is_multiple_of(1024);
        let mut sum = 0.0;
        for voice in &mut self.voices {
            if !voice.active {
                continue;
            }
            if voice.releasing {
                voice.env -= self.release_step;
                if voice.env <= 0.0 {
                    voice.active = false;
                    continue;
                }
            } else {
                voice.env = (voice.env + voice.attack_step).min(1.0);
                voice.hold = voice.hold.saturating_sub(1);
                if voice.hold == 0 {
                    voice.releasing = true;
                }
            }
            let mut sample = 0.0;
            let mut loudest = 0.0_f32;
            for k in 0..HARMONICS.len() {
                if voice.amp[k] == 0.0 {
                    continue;
                }
                let re = voice.re[k] * voice.rot_re[k] - voice.im[k] * voice.rot_im[k];
                let im = voice.re[k] * voice.rot_im[k] + voice.im[k] * voice.rot_re[k];
                voice.re[k] = re;
                voice.im[k] = im;
                if renormalize {
                    let norm = (re * re + im * im).sqrt().max(1e-6);
                    voice.re[k] /= norm;
                    voice.im[k] /= norm;
                }
                sample += im * voice.amp[k];
                voice.amp[k] *= voice.decay[k];
                loudest = loudest.max(voice.amp[k]);
            }
            if loudest < 1e-4 {
                voice.active = false;
                continue;
            }
            sum += sample * voice.env;
        }
        // Gentle saturation: a single note is barely touched, a pile of notes never clips
        let out = sum * HEADROOM;
        out / (1.0 + 0.5 * out.abs()) * self.level
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    fn note(midi: u8, length: u64) -> Note {
        Note {
            start: 0,
            length,
            midi: f32::from(midi),
            velocity: 1.0,
        }
    }

    #[test]
    fn silent_when_off() {
        let mut synth = Synth::new(RATE);
        synth.queue().push(0, &note(60, 4800));
        synth.start_due(0.0, 1.0);
        assert!((0..1000).all(|_| synth.next() == 0.0));
    }

    #[test]
    fn a_note_sounds_then_ends() {
        let mut synth = Synth::new(RATE);
        synth.set(SynthSettings { level: 1.0 });
        synth.queue().push(10, &note(64, 4800));
        // Not yet due
        synth.start_due(5.0, 1.0);
        assert!((0..100).all(|_| synth.next() == 0.0));
        synth.start_due(10.0, 1.0);
        let peak = (0..2000).map(|_| synth.next().abs()).fold(0.0, f32::max);
        assert!(peak > 0.05 && peak < 1.0, "peak {peak}");
        // Held 0.1 s, then released over 60 ms: silent well after that
        for _ in 0..10_000 {
            synth.next();
        }
        assert!((0..100).all(|_| synth.next() == 0.0));
    }

    #[test]
    fn pitch_is_exact() {
        let mut synth = Synth::new(RATE);
        synth.set(SynthSettings { level: 1.0 });
        // A4 with only the fundamental audible enough to count zero crossings
        synth.queue().push(0, &note(69, RATE as u64));
        synth.start_due(0.0, 1.0);
        let samples: Vec<f32> = (0..RATE as usize / 2).map(|_| synth.next()).collect();
        let crossings = samples
            .windows(2)
            .filter(|w| w[0] <= 0.0 && w[1] > 0.0)
            .count();
        // 440 Hz over half a second: 220 upward crossings (harmonics add none at this level)
        assert!((218..=222).contains(&crossings), "{crossings}");
    }

    #[test]
    fn slower_speed_holds_longer() {
        let count = |speed: f32| {
            let mut synth = Synth::new(RATE);
            synth.set(SynthSettings { level: 1.0 });
            synth.queue().push(0, &note(40, 4800));
            synth.start_due(0.0, speed);
            (0..48_000).filter(|_| synth.next() != 0.0).count()
        };
        assert!(count(0.5) > count(1.0) + 3000);
    }

    #[test]
    fn many_notes_never_clip() {
        let mut synth = Synth::new(RATE);
        synth.set(SynthSettings { level: 1.0 });
        for midi in [
            40, 45, 50, 55, 59, 64, 69, 74, 79, 84, 40, 45, 50, 55, 59, 64, 69,
        ] {
            synth.queue().push(0, &note(midi, 48_000));
        }
        synth.start_due(0.0, 1.0);
        let peak = (0..4800).map(|_| synth.next().abs()).fold(0.0, f32::max);
        assert!(peak < 1.0, "peak {peak}");
    }
}
