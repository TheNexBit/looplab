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

/// Extra cost of each group after the first in an additive bar (3+4 has two groups).
const GROUP_COST: f32 = 0.4;
/// Cost of keeping the length of the bar but changing how it is grouped (3+4 → 4+3).
const REGROUP_COST: f32 = 3.0;
/// Additive bars are tried up to this length, in up to this many groups of 2, 3 or 4.
const MAX_ADDITIVE: usize = 12;
const MAX_GROUPS: usize = 3;

/// A kind of bar: its length and, for an additive bar, where its groups start. On the
/// first beat of a later group the activation may be high without cost: the network
/// often hears the "1" of every group (1 2 3 1 2 3 4).
struct Template {
    beats: usize,
    group_start: Vec<bool>,
    cost: f32,
}

/// Every bar the analysis may choose: each length plain, and the additive groupings.
fn templates(level: Level) -> Vec<Template> {
    let mut out: Vec<Template> = (MIN_BEATS..=MAX_BEATS)
        .map(|n| Template {
            beats: n,
            group_start: (0..n).map(|k| k == 0).collect(),
            cost: meter_cost(n, level),
        })
        .collect();
    // Groupings: sequences of 2, 3 and 4 adding up to at most MAX_ADDITIVE
    let mut stack: Vec<Vec<usize>> = vec![vec![2], vec![3], vec![4]];
    while let Some(groups) = stack.pop() {
        let n: usize = groups.iter().sum();
        if groups.len() >= 2 {
            let mut group_start = vec![false; n];
            let mut at = 0;
            for g in &groups {
                group_start[at] = true;
                at += g;
            }
            out.push(Template {
                beats: n,
                group_start,
                cost: meter_cost(n, level) + GROUP_COST * (groups.len() - 1) as f32,
            });
        }
        if groups.len() < MAX_GROUPS {
            for g in [2, 3, 4] {
                if n + g <= MAX_ADDITIVE {
                    let mut longer = groups.clone();
                    longer.push(g);
                    stack.push(longer);
                }
            }
        }
    }
    out
}

/// Beat index of every bar start, given the downbeat probability of each beat. A `true`
/// in `forced` makes that beat a bar start for sure (the user said so).
pub fn bar_starts(down: &[f32], forced: &[bool], level: Level) -> Vec<usize> {
    let beats = down.len();
    if beats == 0 {
        return Vec::new();
    }
    let templates = templates(level);
    // States: (template, k) for every kind of bar and beat k in it, one after the other
    let mut offsets = Vec::with_capacity(templates.len());
    let mut states = 0;
    for t in &templates {
        offsets.push(states);
        states += t.beats;
    }
    let last = |t: usize| offsets[t] + templates[t].beats - 1;
    let emission = |i: usize, t: usize, k: usize| -> f32 {
        if forced.get(i).copied().unwrap_or(false) {
            return if k == 0 { 0.0 } else { f32::NEG_INFINITY };
        }
        let p = down[i].clamp(FLOOR, 1.0 - FLOOR);
        if k == 0 {
            p.ln()
        } else if templates[t].group_start[k] {
            p.max(1.0 - p).ln()
        } else {
            (1.0 - p).ln()
        }
    };
    // Cost of going from a bar of template `a` to one of template `b`
    let switch = |a: usize, b: usize| {
        if a == b {
            0.0
        } else if templates[a].beats == templates[b].beats {
            REGROUP_COST
        } else {
            CHANGE_COST
        }
    };

    let mut score = vec![f32::NEG_INFINITY; states];
    // The piece may start anywhere in a bar (a pickup)
    for (t, template) in templates.iter().enumerate() {
        for k in 0..template.beats {
            score[offsets[t] + k] = emission(0, t, k) - template.cost;
        }
    }
    let mut back = vec![0u16; beats * states];
    let mut next = vec![f32::NEG_INFINITY; states];
    for i in 1..beats {
        next.fill(f32::NEG_INFINITY);
        // The bars that could just have finished: the best of all, and the two best of
        // each length (a regrouping costs less than a change of length)
        let ending = |t: usize| score[last(t)];
        let best_end = (0..templates.len())
            .max_by(|&a, &b| ending(a).total_cmp(&ending(b)))
            .unwrap_or(0);
        let mut by_length = vec![(usize::MAX, usize::MAX); MAX_BEATS + 1];
        for (t, template) in templates.iter().enumerate() {
            let slot = &mut by_length[template.beats];
            if slot.0 == usize::MAX || ending(t) > ending(slot.0) {
                slot.1 = slot.0;
                slot.0 = t;
            } else if slot.1 == usize::MAX || ending(t) > ending(slot.1) {
                slot.1 = t;
            }
        }
        for (t, template) in templates.iter().enumerate() {
            let base = offsets[t];
            // Beat k > 0: only from beat k - 1 of the same bar
            for k in 1..template.beats {
                next[base + k] = score[base + k - 1] + emission(i, t, k);
                back[i * states + base + k] = (base + k - 1) as u16;
            }
            // A new bar: after one of the same template (free), another grouping of the
            // same length, or the best bar of all
            let (first, second) = by_length[template.beats];
            let regroup = if first == t { second } else { first };
            let mut choice = (ending(t), t);
            for from in [regroup, best_end] {
                if from != usize::MAX && from != t {
                    let candidate = ending(from) - switch(from, t);
                    if candidate > choice.0 {
                        choice = (candidate, from);
                    }
                }
            }
            let (best, from) = (choice.0, last(choice.1));
            next[base] = best - template.cost + emission(i, t, 0);
            back[i * states + base] = from as u16;
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
    (0..beats).filter(|&i| offsets.contains(&path[i])).collect()
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
    fn a_seven_counted_three_plus_four_is_one_bar() {
        // 1 2 3 1 2 3 4: the network hears both "1"s almost as strongly
        let pattern = [0.9, 0.05, 0.05, 0.7, 0.05, 0.05, 0.05];
        let down: Vec<f32> = (0..7 * 12).map(|i| pattern[i % 7]).collect();
        let starts = bar_starts(&down, &[], Level::Quarters);
        assert!(
            lengths(&starts, down.len()).iter().all(|&n| n == 7),
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
