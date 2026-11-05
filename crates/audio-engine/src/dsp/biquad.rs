//! Second-order IIR filters ("biquads") with the RBJ Audio EQ Cookbook formulas.

use std::f32::consts::TAU;

use super::eq::BandKind;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Coefficients {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

impl Coefficients {
    pub const IDENTITY: Self = Self {
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
    };

    /// `gain_db` only matters for shelves and peaks; `q` sets width (peaks) or slope (others).
    pub fn new(kind: BandKind, frequency: f32, gain_db: f32, q: f32, sample_rate: u32) -> Self {
        let rate = sample_rate as f32;
        let frequency = frequency.clamp(10.0, rate * 0.45);
        let a = 10_f32.powf(gain_db / 40.0);
        let w0 = TAU * frequency / rate;
        let (sin, cos) = w0.sin_cos();
        let alpha = sin / (2.0 * q.max(0.05));
        let shelf = 2.0 * a.sqrt() * alpha;

        let (b0, b1, b2, a0, a1, a2) = match kind {
            BandKind::Peak => (
                1.0 + alpha * a,
                -2.0 * cos,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos,
                1.0 - alpha / a,
            ),
            BandKind::LowShelf => (
                a * ((a + 1.0) - (a - 1.0) * cos + shelf),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                a * ((a + 1.0) - (a - 1.0) * cos - shelf),
                (a + 1.0) + (a - 1.0) * cos + shelf,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                (a + 1.0) + (a - 1.0) * cos - shelf,
            ),
            BandKind::HighShelf => (
                a * ((a + 1.0) + (a - 1.0) * cos + shelf),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                a * ((a + 1.0) + (a - 1.0) * cos - shelf),
                (a + 1.0) - (a - 1.0) * cos + shelf,
                2.0 * ((a - 1.0) - (a + 1.0) * cos),
                (a + 1.0) - (a - 1.0) * cos - shelf,
            ),
            BandKind::LowPass => {
                let b = (1.0 - cos) / 2.0;
                (b, 1.0 - cos, b, 1.0 + alpha, -2.0 * cos, 1.0 - alpha)
            }
            BandKind::HighPass => {
                let b = (1.0 + cos) / 2.0;
                (b, -(1.0 + cos), b, 1.0 + alpha, -2.0 * cos, 1.0 - alpha)
            }
        };
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    /// Gain in dB the filter applies at `frequency`.
    pub fn magnitude_db(&self, frequency: f32, sample_rate: u32) -> f32 {
        let w = TAU * frequency / sample_rate as f32;
        let (s1, c1) = w.sin_cos();
        let (s2, c2) = (2.0 * w).sin_cos();
        // H(e^jw) = (b0 + b1 e^-jw + b2 e^-2jw) / (1 + a1 e^-jw + a2 e^-2jw)
        let num = (
            self.b0 + self.b1 * c1 + self.b2 * c2,
            -(self.b1 * s1 + self.b2 * s2),
        );
        let den = (
            1.0 + self.a1 * c1 + self.a2 * c2,
            -(self.a1 * s1 + self.a2 * s2),
        );
        let power = (num.0 * num.0 + num.1 * num.1) / (den.0 * den.0 + den.1 * den.1).max(1e-12);
        10.0 * power.max(1e-12).log10()
    }
}

/// Filter memory of one channel (transposed direct form II).
#[derive(Debug, Clone, Copy, Default)]
pub struct State {
    z1: f32,
    z2: f32,
}

impl State {
    #[inline]
    pub fn process(&mut self, c: &Coefficients, x: f32) -> f32 {
        let y = c.b0 * x + self.z1;
        self.z1 = c.b1 * x - c.a1 * y + self.z2;
        self.z2 = c.b2 * x - c.a2 * y;
        y
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;

    #[test]
    fn peak_boosts_its_frequency_only() {
        let c = Coefficients::new(BandKind::Peak, 1_000.0, 6.0, 1.0, RATE);
        assert!((c.magnitude_db(1_000.0, RATE) - 6.0).abs() < 0.05);
        assert!(c.magnitude_db(50.0, RATE).abs() < 0.2);
        assert!(c.magnitude_db(15_000.0, RATE).abs() < 0.2);
    }

    #[test]
    fn shelves_change_one_side() {
        let low = Coefficients::new(BandKind::LowShelf, 200.0, -12.0, 0.7, RATE);
        assert!((low.magnitude_db(20.0, RATE) + 12.0).abs() < 0.5);
        assert!(low.magnitude_db(10_000.0, RATE).abs() < 0.2);
        let high = Coefficients::new(BandKind::HighShelf, 4_000.0, 8.0, 0.7, RATE);
        assert!((high.magnitude_db(18_000.0, RATE) - 8.0).abs() < 0.5);
    }

    #[test]
    fn pass_filters_cut_beyond_the_corner() {
        let hp = Coefficients::new(BandKind::HighPass, 200.0, 0.0, 0.707, RATE);
        assert!(
            (hp.magnitude_db(200.0, RATE) + 3.0).abs() < 0.2,
            "-3 dB at the corner"
        );
        assert!(hp.magnitude_db(50.0, RATE) < -20.0);
        let lp = Coefficients::new(BandKind::LowPass, 2_000.0, 0.0, 0.707, RATE);
        assert!(lp.magnitude_db(16_000.0, RATE) < -30.0);
    }

    #[test]
    fn processing_matches_the_computed_response() {
        let c = Coefficients::new(BandKind::Peak, 1_000.0, 12.0, 1.0, RATE);
        let mut state = State::default();
        let mut peak = 0.0_f32;
        for i in 0..RATE {
            let x = (i as f32 * 1_000.0 * TAU / RATE as f32).sin();
            let y = state.process(&c, x);
            if i > RATE / 2 {
                peak = peak.max(y.abs());
            }
        }
        let measured = 20.0 * peak.log10();
        assert!((measured - 12.0).abs() < 0.2, "measured {measured} dB");
    }
}
