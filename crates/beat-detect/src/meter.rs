//! Bars over the tracked beats: where they start and how many beats they have, decided
//! for the whole piece at once (Viterbi).
//!
//! The network's downbeat activation alone is noisy on complex music: read beat by beat
//! it gives one-beat bars and a meter change every few seconds. Here every beat is in a
//! state "beat k of an n-beat bar" (n from 2 to 16, any meter); a bar start where the
//! activation is high scores, one where it is low costs, and so does a high activation
//! inside a bar. Changing meter costs a fixed amount, so a change is only made where
//! the music keeps it up for a while, and a single odd bar needs strong evidence.

/// Fewest and most beats in a bar.
pub const MIN_BEATS: usize = 2;
pub const MAX_BEATS: usize = 16;

/// Cost of changing meter between two bars (log-probability units).
const CHANGE_COST: f32 = 6.0;
/// Activation probabilities are kept inside this range: no single beat decides alone.
const FLOOR: f32 = 0.03;

/// How the beats are counted: quarters (a rock song at 100 BPM) or eighths (the same
/// song counted at 200, or a 7/8 riff).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Level {
    Quarters,
    Eighths,
}

/// Cost of each bar of `n` beats: the common meters a little cheaper, so noise in a 4/4
/// section is not read as 2/4 + 2/4. Counted in eighths, 4/4 is 8 beats and 2/4 is 4.
fn meter_cost(n: usize, level: Level) -> f32 {
    if level == Level::Eighths {
        return match n {
            8 => 0.0,
            6 => 0.3,
            7 | 5 | 9 => 0.6,
            4 | 12 => 1.0,
            // Usually two bars with a weaker first beat in the second
            16 => 2.5,
            _ => 2.0,
        };
    }
    match n {
        4 => 0.0,
        3 => 0.3,
        5..=7 => 0.6,
        2 => 1.0,
        // Usually two bars with a weaker first beat in the second
        8 => 2.5,
        _ => 2.0,
    }
}

/// Beat index of every bar start, given the downbeat probability of each beat. A `true`
/// in `forced` makes that beat a bar start for sure (the user said so).
pub fn bar_starts(down: &[f32], forced: &[bool], level: Level) -> Vec<usize> {
    let beats = down.len();
    if beats == 0 {
        return Vec::new();
    }
    // States: (n, k) for every meter n and beat k of the bar, laid out one meter after
    // the other
    let mut offsets = Vec::new();
    let mut states = 0;
    for n in MIN_BEATS..=MAX_BEATS {
        offsets.push(states);
        states += n;
    }
    let index = |n: usize, k: usize| offsets[n - MIN_BEATS] + k;
    let emission = |i: usize, k: usize| -> f32 {
        if forced.get(i).copied().unwrap_or(false) {
            return if k == 0 { 0.0 } else { f32::NEG_INFINITY };
        }
        let p = down[i].clamp(FLOOR, 1.0 - FLOOR);
        if k == 0 { p.ln() } else { (1.0 - p).ln() }
    };

    let mut score = vec![f32::NEG_INFINITY; states];
    // The piece may start anywhere in a bar (a pickup)
    for n in MIN_BEATS..=MAX_BEATS {
        for k in 0..n {
            score[index(n, k)] = emission(0, k) - meter_cost(n, level);
        }
    }
    let mut back = vec![0u16; beats * states];
    let mut next = vec![f32::NEG_INFINITY; states];
    for i in 1..beats {
        next.fill(f32::NEG_INFINITY);
        // The two best ways to have just finished a bar, with their meters: a new bar of
        // another meter comes from the best one that is not its own
        let (mut first, mut second) = ((f32::NEG_INFINITY, 0usize), (f32::NEG_INFINITY, 0usize));
        for n in MIN_BEATS..=MAX_BEATS {
            let s = score[index(n, n - 1)];
            if s > first.0 {
                second = first;
                first = (s, n);
            } else if s > second.0 {
                second = (s, n);
            }
        }
        for n in MIN_BEATS..=MAX_BEATS {
            // Beat k > 0: only from beat k - 1 of the same bar
            for k in 1..n {
                let from = index(n, k - 1);
                next[index(n, k)] = score[from] + emission(i, k);
                back[i * states + index(n, k)] = from as u16;
            }
            // A new bar of n beats: after a bar of n (free) or of another meter (a change)
            let same = (score[index(n, n - 1)], n);
            let other = if first.1 == n { second } else { first };
            let (best, from) = if other.0 - CHANGE_COST > same.0 {
                (other.0 - CHANGE_COST, other.1)
            } else {
                same
            };
            next[index(n, 0)] = best - meter_cost(n, level) + emission(i, 0);
            back[i * states + index(n, 0)] = index(from, from - 1) as u16;
        }
        std::mem::swap(&mut score, &mut next);
    }

    // Best final state, then back to the first beat
    let mut state = (0..states)
        .max_by(|&a, &b| score[a].total_cmp(&score[b]))
        .unwrap_or(0);
    let mut path = vec![0usize; beats];
    for i in (0..beats).rev() {
        path[i] = state;
        if i > 0 {
            state = usize::from(back[i * states + state]);
        }
    }
    let is_start = |state: usize| offsets.contains(&state);
    (0..beats).filter(|&i| is_start(path[i])).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Downbeat probabilities of bars of the given lengths: high on bar starts.
    fn probabilities(bars: &[usize], high: f32, low: f32) -> Vec<f32> {
        bars.iter()
            .flat_map(|&n| (0..n).map(move |k| if k == 0 { high } else { low }))
            .collect()
    }

    fn lengths(starts: &[usize], total: usize) -> Vec<usize> {
        let mut out: Vec<usize> = starts.windows(2).map(|w| w[1] - w[0]).collect();
        out.push(total - starts.last().unwrap());
        out
    }

    #[test]
    fn clean_bars_are_read_as_they_are() {
        let mut bars = vec![4; 8];
        bars.extend([7; 8]);
        let down = probabilities(&bars, 0.9, 0.05);
        let starts = bar_starts(&down, &[], Level::Quarters);
        assert_eq!(lengths(&starts, down.len()), bars);
    }

    #[test]
    fn noise_does_not_break_the_meter() {
        let bars = vec![4; 24];
        let mut down = probabilities(&bars, 0.8, 0.05);
        // Spurious downbeats here and there, a few missed ones
        for i in [6, 17, 30, 31, 50, 66] {
            down[i] = 0.85;
        }
        for i in [12, 40, 72] {
            down[i] = 0.1;
        }
        let starts = bar_starts(&down, &[], Level::Quarters);
        assert!(
            lengths(&starts, down.len()).iter().all(|&n| n == 4),
            "{starts:?}"
        );
    }

    #[test]
    fn a_forced_bar_start_moves_the_phase() {
        let down = vec![0.5; 40];
        let mut forced = vec![false; 40];
        forced[2] = true;
        let starts = bar_starts(&down, &forced, Level::Quarters);
        assert!(starts.contains(&2), "{starts:?}");
    }
}
