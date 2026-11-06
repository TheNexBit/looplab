//! The audio callback: track → loop-aware reader → stretch (speed, pitch) → EQ → channels → fades
//! (+ metronome clicks) → device.
//!
//! Real-time safe: every buffer is allocated in `Renderer::new`, nothing here
//! locks, allocates or does I/O.

use std::sync::Arc;
use std::sync::atomic::Ordering;

use cpal::{FromSample, Sample};

use crate::click::{ClickQueue, ClickSettings, ClickVoice};
use crate::dsp::channels::Channels;
use crate::dsp::eq::Eq;
use crate::dsp::stretch::Stretch;
use crate::engine::{Command, LoopSettings, MAX_SPEED, Shared};
use crate::pcm::{CHANNELS, Pcm};

/// Output frames produced per stretch call.
const CHUNK: usize = 256;
/// Fade of the output on play, pause and seek, so they never click.
const FADE_SECONDS: f32 = 0.005;
/// Crossfade of the source where a loop wraps around.
pub(crate) const SPLICE_SECONDS: f32 = 0.005;
/// Share of the remaining speed change applied per chunk (~25 ms to settle at 48 kHz).
const SPEED_SMOOTHING: f32 = 0.2;
/// Chunks remembered to map what is heard back to a track position (covers the stretch latency).
const HISTORY: usize = 128;

/// Reads the track frame by frame, wrapping around the loop with a short crossfade.
pub(crate) struct Reader {
    /// Next frame of the track to read
    position: u64,
    /// Tail of the audio before a loop wrap, fading out
    fade_out_from: u64,
    fade_out_left: usize,
    fade_in_left: usize,
    gap_left: u64,
    /// The last part of the current gap that is a count-in (clicks on its beats)
    count_in_span: u64,
    splice: usize,
    /// Loop repetitions started
    wraps: u64,
}

impl Reader {
    pub(crate) fn new(sample_rate: u32) -> Self {
        Self {
            position: 0,
            fade_out_from: 0,
            fade_out_left: 0,
            fade_in_left: 0,
            gap_left: 0,
            count_in_span: 0,
            splice: ((SPLICE_SECONDS * sample_rate as f32) as usize).max(1),
            wraps: 0,
        }
    }

    pub(crate) fn jump(&mut self, position: u64) {
        self.position = position;
        self.fade_out_left = 0;
        self.fade_in_left = 0;
        self.gap_left = 0;
        self.count_in_span = 0;
    }

    /// Silence with clicks before the next frame is read (count-in before playback starts).
    fn start_count_in(&mut self, click: &ClickSettings) {
        self.count_in_span = click.count_in_frames();
        self.gap_left = self.count_in_span;
    }

    /// Fills `out`; beats met on the way are queued with their input frame (`fed` + index).
    pub(crate) fn read(
        &mut self,
        track: Option<&Pcm>,
        settings: &LoopSettings,
        click: &ClickSettings,
        fed: u64,
        clicks: &mut ClickQueue,
        out: &mut [f32],
    ) {
        let sample = |frame: u64| match track {
            Some(pcm) if frame < pcm.frames() => pcm.frame(frame as usize),
            _ => [0.0; CHANNELS],
        };
        let splice = self.splice as f32;

        for (index, frame) in out.as_chunks_mut::<CHANNELS>().0.iter_mut().enumerate() {
            let at = fed + index as u64;
            let mut mixed = [0.0_f32; CHANNELS];

            if self.fade_out_left > 0 {
                let weight = self.fade_out_left as f32 / splice;
                for (m, s) in mixed.iter_mut().zip(sample(self.fade_out_from)) {
                    *m += s * weight;
                }
                self.fade_out_from += 1;
                self.fade_out_left -= 1;
            }

            if self.gap_left > 0 {
                // The count-in is the end of the gap: one click per beat, the first of every
                // bar accented (two bars of 4/4: beats 1 and 5), like the metronome
                if self.gap_left <= self.count_in_span && click.beat > 0 {
                    let into = self.count_in_span - self.gap_left;
                    if into.is_multiple_of(click.beat) {
                        let beat = into / click.beat;
                        clicks.push(at, beat.is_multiple_of(click.bar_length()));
                    }
                }
                self.gap_left -= 1;
            } else {
                if let Some(accent) = click.beat_at(self.position) {
                    clicks.push(at, accent);
                }
                let weight = if self.fade_in_left > 0 {
                    self.fade_in_left -= 1;
                    1.0 - self.fade_in_left as f32 / splice
                } else {
                    1.0
                };
                for (m, s) in mixed.iter_mut().zip(sample(self.position)) {
                    *m += s * weight;
                }
                self.position += 1;
                if settings.is_active() && self.position == settings.end {
                    self.wrap(settings, click);
                }
            }

            frame.copy_from_slice(&mixed);
        }
    }

    /// Loop end reached: let the old audio fade out while the restart fades in
    /// (after the gap and the count-in).
    fn wrap(&mut self, settings: &LoopSettings, click: &ClickSettings) {
        self.fade_out_from = self.position;
        self.fade_out_left = self.splice;
        self.position = settings.restart_at();
        self.count_in_span = click.count_in_frames();
        self.gap_left = settings.gap + self.count_in_span;
        self.fade_in_left = self.splice;
        self.wraps += 1;
    }
}

/// Which track frame entered the stretcher at a given point of the input stream.
#[derive(Clone, Copy, Default)]
struct Mark {
    fed: u64,
    position: u64,
    /// Frames of silence still to come before `position` is read
    gap: u64,
}

pub(crate) struct Renderer {
    commands: rtrb::Consumer<Command>,
    garbage: rtrb::Producer<Arc<Pcm>>,
    shared: Arc<Shared>,
    track: Option<Arc<Pcm>>,
    reader: Reader,
    stretch: Stretch,
    eq: Eq,
    channels: Channels,
    settings: LoopSettings,
    click: ClickSettings,
    clicks: ClickQueue,
    voice: ClickVoice,
    /// Play was pressed with a count-in: the next jump starts with it
    count_in_on_jump: bool,

    input: Vec<f32>,
    output: Vec<f32>,
    /// Next frame to play from `output`; `CHUNK` means a new chunk is needed
    output_index: usize,

    /// What the user asked for; the actual sound fades towards it
    playing: bool,
    pending_seek: Option<u64>,
    gain: f32,
    gain_step: f32,

    speed: f32,
    target_speed: f32,
    /// Fraction of an input frame carried to the next chunk, so speeds average out exactly
    input_debt: f64,

    /// Total frames fed to the stretcher, and where they came from
    fed: u64,
    history: [Mark; HISTORY],
    history_next: usize,
    /// After a seek, report the target until the new audio is actually heard
    seek_mark: Option<Mark>,
}

impl Renderer {
    pub fn new(
        sample_rate: u32,
        commands: rtrb::Consumer<Command>,
        garbage: rtrb::Producer<Arc<Pcm>>,
        shared: Arc<Shared>,
    ) -> Self {
        let stretch = Stretch::new(sample_rate);
        let max_input = stretch
            .input_latency()
            .max((CHUNK as f32 * MAX_SPEED).ceil() as usize + 1);
        assert!(
            max_input <= stretch.max_block(),
            "stretch blocks too small for the speed range"
        );

        Self {
            commands,
            garbage,
            shared,
            track: None,
            reader: Reader::new(sample_rate),
            stretch,
            eq: Eq::new(sample_rate),
            channels: Channels::new(sample_rate),
            settings: LoopSettings::default(),
            click: ClickSettings::default(),
            clicks: ClickQueue::new(),
            voice: ClickVoice::new(sample_rate),
            count_in_on_jump: false,
            input: vec![0.0; max_input * CHANNELS],
            output: vec![0.0; CHUNK * CHANNELS],
            output_index: CHUNK,
            playing: false,
            pending_seek: None,
            gain: 0.0,
            gain_step: 1.0 / (FADE_SECONDS * sample_rate as f32).max(1.0),
            speed: 1.0,
            target_speed: 1.0,
            input_debt: 0.0,
            fed: 0,
            history: [Mark::default(); HISTORY],
            history_next: 0,
            seek_mark: None,
        }
    }

    pub fn render<T: Sample + FromSample<f32>>(&mut self, out: &mut [T], channels: usize) {
        self.apply_commands();
        for frame in out.chunks_exact_mut(channels) {
            let [left, right] = self.next_frame();
            if let [first, second, rest @ ..] = frame {
                *first = T::from_sample(left);
                *second = T::from_sample(right);
                rest.fill(T::EQUILIBRIUM);
            } else if let [mono] = frame {
                *mono = T::from_sample((left + right) * 0.5);
            }
        }

        let heard = self.heard_position();
        if self.playing
            && self.settings_allow_end()
            && self.track_frames().is_some_and(|end| heard >= end)
        {
            self.playing = false;
            self.gain = 0.0;
        }
        self.shared.position.store(heard, Ordering::Relaxed);
        self.shared.playing.store(self.playing, Ordering::Relaxed);
        self.shared
            .loops
            .store(self.reader.wraps, Ordering::Relaxed);
    }

    fn track_frames(&self) -> Option<u64> {
        self.track.as_ref().map(|t| t.frames())
    }

    /// A looping track never ends on its own.
    fn settings_allow_end(&self) -> bool {
        !self.settings.is_active()
    }

    fn apply_commands(&mut self) {
        while let Ok(command) = self.commands.pop() {
            match command {
                Command::SetTrack(pcm) => {
                    if let Some(old) = self.track.replace(pcm)
                        && let Err(rtrb::PushError::Full(old)) = self.garbage.push(old)
                    {
                        // Never free memory here: leaking is better than a glitch
                        std::mem::forget(old);
                    }
                    self.playing = false;
                    self.gain = 0.0;
                    self.settings = LoopSettings::default();
                    self.jump(0);
                }
                Command::Play => self.play(),
                Command::Pause => {
                    self.playing = false;
                    self.count_in_on_jump = false;
                }
                Command::Seek(frame) => {
                    self.pending_seek = Some(frame.min(self.track_frames().unwrap_or(0)));
                }
                Command::SetSpeed(speed) => self.target_speed = speed,
                Command::SetTranspose(factor) => self.stretch.set_transpose(factor),
                Command::SetLoop(settings) => self.settings = settings,
                Command::SetEq(settings) => self.eq.set(settings),
                Command::SetChannelMode(mode) => self.channels.set(mode),
                Command::SetClick(settings) => self.click = settings,
            }
        }
    }

    fn play(&mut self) {
        let Some(end) = self.track_frames() else {
            return;
        };
        // Play always resumes where the playhead is: the loop only takes over when playback
        // reaches its end. Only at the very end of the track does it start over
        if self.heard_position() >= end {
            let restart = if self.settings.is_active() {
                self.settings.restart_at()
            } else {
                0
            };
            self.pending_seek = Some(restart);
        }
        // With a count-in, playback restarts from the same point after the counted beats
        if self.click.count_in_frames() > 0 {
            self.pending_seek = Some(self.pending_seek.unwrap_or_else(|| self.heard_position()));
            self.count_in_on_jump = true;
        }
        self.playing = true;
    }

    #[inline]
    fn next_frame(&mut self) -> [f32; 2] {
        let target = if self.playing && self.pending_seek.is_none() {
            1.0
        } else {
            0.0
        };
        if self.gain < target {
            self.gain = (self.gain + self.gain_step).min(1.0);
        } else if self.gain > target {
            self.gain = (self.gain - self.gain_step).max(0.0);
        }

        if self.gain == 0.0 {
            if let Some(frame) = self.pending_seek.take() {
                self.jump(frame);
            }
            // Paused: the reader and the stretcher stay frozen until play
            if !self.playing {
                return [0.0; 2];
            }
        }

        if self.output_index == CHUNK {
            self.render_chunk();
        }
        let i = self.output_index * CHANNELS;
        self.output_index += 1;
        let heard = self.heard_fed();
        while let Some(accent) = self.clicks.pop_due(heard) {
            self.voice.start(accent);
        }
        let click = self.voice.next(self.click.volume);
        [
            self.output[i] * self.gain + click,
            self.output[i + 1] * self.gain + click,
        ]
    }

    fn render_chunk(&mut self) {
        self.speed += (self.target_speed - self.speed) * SPEED_SMOOTHING;
        self.input_debt += CHUNK as f64 * f64::from(self.speed);
        let frames = self.input_debt.floor() as usize;
        self.input_debt -= frames as f64;

        self.remember();
        let input = &mut self.input[..frames * CHANNELS];
        self.reader.read(
            self.track.as_deref(),
            &self.settings,
            &self.click,
            self.fed,
            &mut self.clicks,
            input,
        );
        self.fed += frames as u64;

        self.stretch
            .process(&self.input[..frames * CHANNELS], &mut self.output);
        self.eq.process(&mut self.output);
        self.channels.process(&mut self.output);
        self.output_index = 0;
    }

    /// Restarts the stretcher at `frame`, pre-rolled so the next output starts exactly there.
    fn jump(&mut self, frame: u64) {
        self.stretch.reset();
        self.reader.jump(frame);
        self.clicks.clear();
        self.voice.stop();
        if std::mem::take(&mut self.count_in_on_jump) {
            self.reader.start_count_in(&self.click);
        }
        self.output_index = CHUNK;
        self.input_debt = 0.0;

        let preroll = self.stretch.input_latency();
        self.remember();
        self.seek_mark = Some(Mark {
            fed: self.fed,
            position: frame,
            gap: self.reader.gap_left,
        });
        let input = &mut self.input[..preroll * CHANNELS];
        self.reader.read(
            self.track.as_deref(),
            &self.settings,
            &self.click,
            self.fed,
            &mut self.clicks,
            input,
        );
        self.fed += preroll as u64;
        self.stretch
            .seek(&self.input[..preroll * CHANNELS], f64::from(self.speed));
    }

    fn remember(&mut self) {
        self.history[self.history_next] = Mark {
            fed: self.fed,
            position: self.reader.position,
            gap: self.reader.gap_left,
        };
        self.history_next = (self.history_next + 1) % HISTORY;
    }

    /// Track frame being heard now: the input point minus the stretcher latency and the
    /// output not yet played, mapped back through recent history (so loop wraps are undone).
    fn heard_position(&self) -> u64 {
        let heard_fed = self.heard_fed() as u64;

        if let Some(mark) = self.seek_mark
            && heard_fed < mark.fed + self.stretch.input_latency() as u64
        {
            return mark.position;
        }

        // Most recent mark at or before the point being heard
        let mut best: Option<Mark> = None;
        for mark in &self.history {
            if mark.fed <= heard_fed && best.is_none_or(|b| mark.fed > b.fed) {
                best = Some(*mark);
            }
        }
        // During a gap or count-in the playhead waits at the frame that comes next
        let position = best.map_or(0, |m| {
            m.position + (heard_fed - m.fed).saturating_sub(m.gap)
        });
        position.min(self.track_frames().unwrap_or(0))
    }

    /// Input frame (stretcher feed count) being heard now: the feed point minus the
    /// stretcher latency and the output not yet played.
    fn heard_fed(&self) -> f64 {
        let pending_output = (CHUNK - self.output_index) + self.stretch.output_latency();
        let lag =
            self.stretch.input_latency() as f64 + pending_output as f64 * f64::from(self.speed);
        (self.fed as f64 - lag).max(0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::click::ClickSettings;
    use crate::engine::{Control, channel};

    const RATE: u32 = 48_000;
    const SECOND: u64 = RATE as u64;

    /// Two-channel 220 Hz tone, `seconds` long.
    fn track(seconds: f32) -> Arc<Pcm> {
        let frames = (seconds * RATE as f32) as usize;
        let mut pcm = Pcm::with_capacity(RATE, frames);
        let samples: Vec<f32> = (0..frames)
            .flat_map(|i| {
                let s = (i as f32 * 220.0 * std::f32::consts::TAU / RATE as f32).sin() * 0.5;
                [s, s]
            })
            .collect();
        pcm.extend_from_f32(&samples);
        Arc::new(pcm)
    }

    struct Harness {
        control: Control,
        shared: Arc<Shared>,
        renderer: Renderer,
    }

    impl Harness {
        fn new(seconds: f32) -> Self {
            let (mut control, shared, renderer) = channel(RATE);
            control
                .commands
                .push(Command::SetTrack(track(seconds)))
                .ok();
            Self {
                control,
                shared,
                renderer,
            }
        }

        fn send(&mut self, command: Command) {
            self.control.commands.push(command).ok();
        }

        /// Renders `seconds` of audio in device-sized blocks and returns it.
        fn render(&mut self, seconds: f32) -> Vec<f32> {
            let frames = (seconds * RATE as f32) as usize;
            let mut all = Vec::with_capacity(frames * 2);
            let mut block = vec![0.0_f32; 480 * 2];
            for _ in 0..frames.div_ceil(480) {
                self.renderer.render(&mut block, 2);
                all.extend_from_slice(&block);
            }
            all
        }

        fn position(&self) -> u64 {
            self.shared.position.load(Ordering::Relaxed)
        }

        fn playing(&self) -> bool {
            self.shared.playing.load(Ordering::Relaxed)
        }
    }

    fn loudness(samples: &[f32]) -> f32 {
        samples.iter().fold(0.0_f32, |m, s| m.max(s.abs()))
    }

    fn close(actual: u64, expected: u64, tolerance: u64) -> bool {
        actual.abs_diff(expected) <= tolerance
    }

    #[test]
    fn silent_until_play() {
        let mut h = Harness::new(2.0);
        assert_eq!(loudness(&h.render(0.2)), 0.0);
        assert_eq!(h.position(), 0);
    }

    #[test]
    fn plays_and_reports_what_is_heard() {
        let mut h = Harness::new(3.0);
        h.send(Command::Play);
        let out = h.render(1.0);
        assert!(loudness(&out[out.len() / 2..]) > 0.3, "the tone is audible");
        assert!(h.playing());
        // Rendered 1 s; what is heard trails by the stretcher's output latency at most
        let position = h.position();
        assert!(
            position <= SECOND && position > SECOND * 8 / 10,
            "position {position}"
        );
    }

    #[test]
    fn half_speed_advances_half_as_fast() {
        let mut h = Harness::new(4.0);
        h.send(Command::SetSpeed(0.5));
        h.send(Command::Play);
        h.render(1.0);
        let start = h.position();
        h.render(2.0);
        let advanced = h.position() - start;
        assert!(
            close(advanced, SECOND, SECOND / 20),
            "advanced {advanced} frames in 2 s"
        );
    }

    #[test]
    fn pause_freezes_the_position() {
        let mut h = Harness::new(3.0);
        h.send(Command::Play);
        h.render(0.5);
        h.send(Command::Pause);
        h.render(0.1);
        let stopped = h.position();
        let silence = h.render(0.5);
        assert_eq!(loudness(&silence), 0.0);
        assert_eq!(h.position(), stopped);
        assert!(!h.playing());
    }

    #[test]
    fn seek_reports_the_target_at_once() {
        let mut h = Harness::new(5.0);
        h.send(Command::Play);
        h.render(0.3);
        h.send(Command::Seek(3 * SECOND));
        h.render(0.05);
        let position = h.position();
        assert!(
            close(position, 3 * SECOND, SECOND / 10),
            "position {position}"
        );
    }

    #[test]
    fn loop_keeps_playing_inside_the_region() {
        let mut h = Harness::new(5.0);
        let region = LoopSettings {
            enabled: true,
            start: SECOND,
            end: 2 * SECOND,
            lead_in: 0,
            gap: 0,
        };
        h.send(Command::SetLoop(region));
        h.send(Command::Seek(SECOND));
        h.send(Command::Play);
        h.render(0.2);
        let mut seen_restart = false;
        let mut last = h.position();
        for _ in 0..40 {
            h.render(0.1);
            let position = h.position();
            assert!(
                (SECOND - SECOND / 50..=2 * SECOND).contains(&position),
                "position {position}"
            );
            seen_restart |= position < last;
            last = position;
        }
        assert!(seen_restart, "the loop wrapped around");
        assert!(h.playing(), "a loop never ends on its own");
    }

    #[test]
    fn lead_in_starts_each_repetition_earlier() {
        let mut h = Harness::new(5.0);
        let region = LoopSettings {
            enabled: true,
            start: 2 * SECOND,
            end: 3 * SECOND,
            lead_in: SECOND / 2,
            gap: 0,
        };
        h.send(Command::SetLoop(region));
        h.send(Command::Seek(region.restart_at()));
        h.send(Command::Play);
        h.render(0.1);
        let first = h.position();
        assert!(
            close(first, 2 * SECOND - SECOND / 2, SECOND / 5),
            "starts at the lead-in: {first}"
        );
        h.render(1.6);
        let after_wrap = h.position();
        assert!(
            after_wrap < 2 * SECOND,
            "lead-in again after the wrap: {after_wrap}"
        );
    }

    #[test]
    fn gap_inserts_silence_between_repetitions() {
        let mut h = Harness::new(5.0);
        let region = LoopSettings {
            enabled: true,
            start: SECOND,
            end: SECOND + SECOND / 2,
            lead_in: 0,
            gap: SECOND / 2,
        };
        h.send(Command::SetLoop(region));
        h.send(Command::Seek(SECOND));
        h.send(Command::Play);
        let out = h.render(2.0);
        // Find a run of near-silence of at least 0.3 s after the first repetition
        let quiet_frames = out
            .chunks(2)
            .map(|f| f[0].abs() < 0.01)
            .fold((0_usize, 0_usize), |(run, best), quiet| {
                let run = if quiet { run + 1 } else { 0 };
                (run, best.max(run))
            })
            .1;
        assert!(
            quiet_frames as u64 > SECOND * 3 / 10,
            "longest silence {quiet_frames} frames"
        );
    }

    #[test]
    fn stops_at_the_end_and_restarts_on_play() {
        let mut h = Harness::new(0.5);
        h.send(Command::Play);
        h.render(1.5);
        assert!(!h.playing());
        assert_eq!(h.position(), SECOND / 2);
        h.send(Command::Play);
        h.render(0.05);
        assert!(
            h.position() < SECOND / 10,
            "restarted from the top: {}",
            h.position()
        );
    }

    #[test]
    fn play_resumes_where_the_playhead_is_even_outside_the_loop() {
        let mut h = Harness::new(6.0);
        let region = LoopSettings {
            enabled: true,
            start: SECOND,
            end: 2 * SECOND,
            lead_in: 0,
            gap: 0,
        };
        h.send(Command::SetLoop(region));
        h.send(Command::Seek(4 * SECOND));
        h.render(0.05);
        h.send(Command::Play);
        h.render(0.5);
        let position = h.position();
        assert!(position > 4 * SECOND, "kept the chosen point: {position}");
    }

    #[test]
    fn play_after_pause_continues_from_the_same_point() {
        let mut h = Harness::new(6.0);
        h.send(Command::Play);
        h.render(1.0);
        h.send(Command::Pause);
        h.render(0.2);
        let paused_at = h.position();
        h.render(1.0);
        h.send(Command::Play);
        h.render(0.05);
        let resumed = h.position();
        assert!(
            resumed >= paused_at && resumed - paused_at < SECOND / 10,
            "paused at {paused_at}, resumed at {resumed}"
        );
    }

    #[test]
    fn replaced_track_is_freed_outside_the_audio_thread() {
        let mut h = Harness::new(0.5);
        h.render(0.01);
        h.send(Command::SetTrack(track(0.5)));
        h.render(0.01);
        assert!(h.control.garbage.pop().is_ok());
    }

    fn short_loop() -> LoopSettings {
        LoopSettings {
            enabled: true,
            start: SECOND,
            end: SECOND + SECOND / 2,
            lead_in: 0,
            gap: 0,
        }
    }

    /// Positions reported every 10 ms over `seconds`.
    fn positions(h: &mut Harness, seconds: f32) -> Vec<u64> {
        (0..(seconds * 100.0) as usize)
            .map(|_| {
                h.render(0.01);
                h.position()
            })
            .collect()
    }

    /// Longest run of reports equal to `frame`, in seconds.
    fn longest_wait_at(reports: &[u64], frame: u64) -> f32 {
        let longest = reports
            .iter()
            .fold((0_usize, 0_usize), |(run, best), &p| {
                let run = if p == frame { run + 1 } else { 0 };
                (run, best.max(run))
            })
            .1;
        longest as f32 / 100.0
    }

    #[test]
    fn counts_every_loop_repetition() {
        let mut h = Harness::new(5.0);
        h.send(Command::SetLoop(short_loop()));
        h.send(Command::Seek(SECOND));
        h.send(Command::Play);
        h.render(2.2);
        let loops = h.shared.loops.load(Ordering::Relaxed);
        assert!(
            (3..=5).contains(&loops),
            "{loops} repetitions in 2.2 s of a 0.5 s loop"
        );
    }

    #[test]
    fn count_in_before_play_holds_the_playhead_and_clicks() {
        let mut h = Harness::new(5.0);
        h.send(Command::SetClick(ClickSettings {
            beat: SECOND / 4,
            count_in: 4,
            volume: 1.0,
            ..ClickSettings::default()
        }));
        h.send(Command::Seek(2 * SECOND));
        h.render(0.05);
        h.send(Command::Play);
        let reports = positions(&mut h, 1.5);
        let waited = longest_wait_at(&reports, 2 * SECOND);
        assert!(
            (0.85..=1.15).contains(&waited),
            "waited {waited} s for 4 beats of 0.25 s"
        );
        let last = *reports.last().unwrap_or(&0);
        assert!(last > 2 * SECOND + SECOND / 5, "then plays on: {last}");
    }

    #[test]
    fn count_in_comes_back_before_every_repetition() {
        let mut h = Harness::new(5.0);
        h.send(Command::SetLoop(short_loop()));
        h.send(Command::Seek(SECOND));
        h.render(0.05);
        h.send(Command::SetClick(ClickSettings {
            beat: SECOND / 4,
            count_in: 2,
            volume: 1.0,
            ..ClickSettings::default()
        }));
        h.send(Command::Play);
        // Skip the count-in before playback and the first repetition
        h.render(1.1);
        let reports = positions(&mut h, 1.2);
        let waited = longest_wait_at(&reports, SECOND);
        assert!(
            (0.4..=0.6).contains(&waited),
            "waited {waited} s for 2 beats of 0.25 s"
        );
    }

    #[test]
    fn count_in_accents_the_first_beat_of_every_bar() {
        // Two bars of 3/4: accents on beats 1 and 4
        let click = ClickSettings {
            beat: 100,
            count_in: 6,
            beats_per_bar: 3,
            volume: 1.0,
            ..ClickSettings::default()
        };
        let mut reader = Reader::new(48_000);
        let mut clicks = ClickQueue::new();
        reader.start_count_in(&click);
        let mut silence = vec![0.0; 600 * CHANNELS];
        reader.read(
            None,
            &LoopSettings::default(),
            &click,
            0,
            &mut clicks,
            &mut silence,
        );
        let accents: Vec<bool> = std::iter::from_fn(|| clicks.pop_due(f64::MAX)).collect();
        assert_eq!(accents, [true, false, false, true, false, false]);
    }

    #[test]
    fn metronome_clicks_on_every_beat() {
        let mut h = Harness::new(4.0);
        // A silent track: anything heard is a click
        let mut silent = Pcm::with_capacity(RATE, 4 * RATE as usize);
        silent.extend_from_f32(&vec![0.0; 8 * RATE as usize]);
        h.send(Command::SetTrack(Arc::new(silent)));
        h.send(Command::SetClick(ClickSettings {
            beat: SECOND / 2,
            metronome: true,
            volume: 0.8,
            ..ClickSettings::default()
        }));
        h.send(Command::Play);
        let out = h.render(2.0);
        // Onsets: a loud sample after at least 0.1 s of silence
        let (_, onsets) = out.chunks(2).fold((usize::MAX, 0), |(quiet, onsets), f| {
            if f[0].abs() > 0.2 {
                (0, onsets + usize::from(quiet > RATE as usize / 10))
            } else {
                (quiet.saturating_add(1), onsets)
            }
        });
        assert!(
            (3..=5).contains(&onsets),
            "{onsets} clicks in 2 s at 120 BPM"
        );
    }
}
