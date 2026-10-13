use rodio::Source;
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EqualizerBands {
    pub b32: f32,
    pub b64: f32,
    pub b125: f32,
    pub b250: f32,
    pub b500: f32,
    pub b1k: f32,
    pub b2k: f32,
    pub b4k: f32,
    pub b8k: f32,
    pub b16k: f32,
}

impl Default for EqualizerBands {
    fn default() -> Self {
        Self {
            b32: 0.0,
            b64: 0.0,
            b125: 0.0,
            b250: 0.0,
            b500: 0.0,
            b1k: 0.0,
            b2k: 0.0,
            b4k: 0.0,
            b8k: 0.0,
            b16k: 0.0,
        }
    }
}

fn default_stereo_width() -> f32 {
    100.0
}
fn default_reverb_size() -> f32 {
    50.0
}
fn default_reverb_damp() -> f32 {
    40.0
}
fn default_true() -> bool {
    true
}
fn default_playback_speed() -> f32 {
    1.0
}

fn default_target_lufs() -> f32 {
    -14.0
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DspConfig {
    pub enabled: bool,
    #[serde(rename = "bassBoost", default)]
    pub bass_boost: f32,
    #[serde(default)]
    pub bands: EqualizerBands,
    #[serde(rename = "stereoWidth", default = "default_stereo_width")]
    pub stereo_width: f32,
    #[serde(default)]
    pub crossfeed: bool,
    #[serde(rename = "tubeWarmth", default)]
    pub tube_warmth: f32,
    #[serde(default)]
    pub clarity: f32,
    #[serde(rename = "reverbWet", default)]
    pub reverb_wet: f32,
    #[serde(rename = "reverbSize", default = "default_reverb_size")]
    pub reverb_size: f32,
    #[serde(rename = "reverbDamp", default = "default_reverb_damp")]
    pub reverb_damp: f32,
    #[serde(default = "default_true")]
    pub limiter: bool,
    #[serde(rename = "loudnessNormalization", default)]
    pub loudness_normalization: bool,
    #[serde(rename = "targetLufs", default = "default_target_lufs")]
    pub target_lufs: f32,
    #[serde(rename = "playbackSpeed", default = "default_playback_speed")]
    pub playback_speed: f32,
    #[serde(rename = "pitchShift", default)]
    pub pitch_shift: f32,
}

impl Default for DspConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bass_boost: 0.0,
            bands: EqualizerBands::default(),
            stereo_width: 100.0,
            crossfeed: false,
            tube_warmth: 0.0,
            clarity: 0.0,
            reverb_wet: 0.0,
            reverb_size: 50.0,
            reverb_damp: 40.0,
            limiter: true,
            loudness_normalization: false,
            target_lufs: -14.0,
            playback_speed: 1.0,
            pitch_shift: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    pub fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    pub fn peaking(sample_rate: f32, freq: f32, gain_db: f32, q: f32) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::identity();
        }
        let a = 10.0_f32.powf(gain_db / 40.0);
        let omega = 2.0 * PI * freq / sample_rate;
        let sin_w = omega.sin();
        let cos_w = omega.cos();
        let alpha = sin_w / (2.0 * q);

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_w;
        let a2 = 1.0 - alpha / a;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    pub fn low_shelf(sample_rate: f32, freq: f32, gain_db: f32) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::identity();
        }
        let a = 10.0_f32.powf(gain_db / 40.0);
        let omega = 2.0 * PI * freq / sample_rate;
        let sin_w = omega.sin();
        let cos_w = omega.cos();
        let q = 0.707_f32;
        let alpha = sin_w / (2.0 * q);
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w + two_sqrt_a_alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w - two_sqrt_a_alpha);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w + two_sqrt_a_alpha;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }

    pub fn high_shelf(sample_rate: f32, freq: f32, gain_db: f32) -> Self {
        if gain_db.abs() < 0.01 {
            return Self::identity();
        }
        let a = 10.0_f32.powf(gain_db / 40.0);
        let omega = 2.0 * PI * freq / sample_rate;
        let sin_w = omega.sin();
        let cos_w = omega.cos();
        let q = 0.707_f32;
        let alpha = sin_w / (2.0 * q);
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w + two_sqrt_a_alpha);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w - two_sqrt_a_alpha);
        let a0 = (a + 1.0) - (a - 1.0) * cos_w + two_sqrt_a_alpha;
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w);
        let a2 = (a + 1.0) - (a - 1.0) * cos_w - two_sqrt_a_alpha;

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ChannelFilterState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Default for ChannelFilterState {
    fn default() -> Self {
        Self {
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }
}

impl ChannelFilterState {
    #[inline(always)]
    pub fn process(&mut self, input: f32, c: &BiquadCoeffs) -> f32 {
        let out = c.b0 * input + c.b1 * self.x1 + c.b2 * self.x2 - c.a1 * self.y1 - c.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = out;
        out
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct CrossfeedState {
    low_l: f32,
    low_r: f32,
}

impl CrossfeedState {
    #[inline]
    fn process(&mut self, left: f32, right: f32, alpha: f32) -> (f32, f32) {
        self.low_l += alpha * (left - self.low_l);
        self.low_r += alpha * (right - self.low_r);
        let out_l = left * 0.82 + self.low_r * 0.18;
        let out_r = right * 0.82 + self.low_l * 0.18;
        (out_l, out_r)
    }

    fn reset(&mut self) {
        self.low_l = 0.0;
        self.low_r = 0.0;
    }
}

#[derive(Debug, Clone)]
struct CombFilter {
    buffer: Vec<f32>,
    buf_size: usize,
    buf_idx: usize,
    filter_store: f32,
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            buf_size: size,
            buf_idx: 0,
            filter_store: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damp: f32) -> f32 {
        let output = self.buffer[self.buf_idx];
        self.filter_store = output * (1.0 - damp) + self.filter_store * damp;
        self.buffer[self.buf_idx] = input + self.filter_store * feedback;
        self.buf_idx += 1;
        if self.buf_idx >= self.buf_size {
            self.buf_idx = 0;
        }
        output
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.buf_idx = 0;
        self.filter_store = 0.0;
    }
}

#[derive(Debug, Clone)]
struct AllpassFilter {
    buffer: Vec<f32>,
    buf_size: usize,
    buf_idx: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            buf_size: size,
            buf_idx: 0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let buf_out = self.buffer[self.buf_idx];
        let feedback = 0.5_f32;
        let output = -input + buf_out;
        self.buffer[self.buf_idx] = input + buf_out * feedback;
        self.buf_idx += 1;
        if self.buf_idx >= self.buf_size {
            self.buf_idx = 0;
        }
        output
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.buf_idx = 0;
    }
}

#[derive(Debug, Clone)]
struct StereoFreeverb {
    combs_l: Vec<CombFilter>,
    combs_r: Vec<CombFilter>,
    allpass_l: Vec<AllpassFilter>,
    allpass_r: Vec<AllpassFilter>,
}

impl StereoFreeverb {
    fn new(sample_rate: f32) -> Self {
        let scale = (sample_rate / 44100.0).max(0.5);
        let comb_tunings = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
        let allpass_tunings = [556, 441, 341, 225];
        let stereo_spread = 23;

        let combs_l = comb_tunings
            .iter()
            .map(|&d| CombFilter::new(((d as f32) * scale).round() as usize))
            .collect();
        let combs_r = comb_tunings
            .iter()
            .map(|&d| CombFilter::new((((d + stereo_spread) as f32) * scale).round() as usize))
            .collect();
        let allpass_l = allpass_tunings
            .iter()
            .map(|&d| AllpassFilter::new(((d as f32) * scale).round() as usize))
            .collect();
        let allpass_r = allpass_tunings
            .iter()
            .map(|&d| AllpassFilter::new((((d + stereo_spread) as f32) * scale).round() as usize))
            .collect();

        Self {
            combs_l,
            combs_r,
            allpass_l,
            allpass_r,
        }
    }

    #[inline]
    fn process(&mut self, in_l: f32, in_r: f32, room_size: f32, damp_val: f32) -> (f32, f32) {
        let input = (in_l + in_r) * 0.015;
        let feedback = (0.7 + room_size * 0.28).clamp(0.0, 0.98);
        let damp = (damp_val * 0.4).clamp(0.0, 0.95);

        let mut out_l = 0.0_f32;
        for comb in &mut self.combs_l {
            out_l += comb.process(input, feedback, damp);
        }
        for ap in &mut self.allpass_l {
            out_l = ap.process(out_l);
        }

        let mut out_r = 0.0_f32;
        for comb in &mut self.combs_r {
            out_r += comb.process(input, feedback, damp);
        }
        for ap in &mut self.allpass_r {
            out_r = ap.process(out_r);
        }

        (out_l * 2.0, out_r * 2.0)
    }

    fn reset(&mut self) {
        for c in &mut self.combs_l {
            c.reset();
        }
        for c in &mut self.combs_r {
            c.reset();
        }
        for a in &mut self.allpass_l {
            a.reset();
        }
        for a in &mut self.allpass_r {
            a.reset();
        }
    }
}

#[inline]
fn apply_tube_warmth(sample: f32, amount: f32) -> f32 {
    if amount <= 0.001 {
        return sample;
    }
    let wet = (amount / 100.0).clamp(0.0, 1.0);
    let drive = 1.0 + wet * 2.5;
    let x = sample * drive;
    let sat = if x >= 0.0 {
        x / (1.0 + 0.35 * x)
    } else {
        let x_abs = -x;
        -(x_abs / (1.0 + 0.25 * x_abs + 0.1 * x_abs * x_abs))
    };
    let warmed = sat / drive.sqrt();
    sample * (1.0 - wet) + warmed * wet
}

#[inline]
fn apply_soft_limiter(sample: f32) -> f32 {
    let threshold = 0.85_f32;
    let abs_val = sample.abs();
    if abs_val <= threshold {
        sample
    } else {
        let excess = abs_val - threshold;
        let headroom = 1.0 - threshold;
        let compressed = threshold + headroom * (excess / headroom).tanh();
        sample.signum() * compressed.min(0.999)
    }
}

pub struct StereoPitchShifter {
    buffer_l: Vec<f32>,
    buffer_r: Vec<f32>,
    write_pos: usize,
    phase: f32,
    buf_size: usize,
}

impl StereoPitchShifter {
    pub fn new(size: usize) -> Self {
        Self {
            buffer_l: vec![0.0; size],
            buffer_r: vec![0.0; size],
            write_pos: 0,
            phase: 0.0,
            buf_size: size,
        }
    }

    #[inline]
    pub fn process(&mut self, in_l: f32, in_r: f32, semitones: f32) -> (f32, f32) {
        if semitones.abs() < 0.05 {
            return (in_l, in_r);
        }

        self.buffer_l[self.write_pos] = in_l;
        self.buffer_r[self.write_pos] = in_r;

        let half_size = (self.buf_size / 2) as f32;
        let pitch_ratio = 2.0_f32.powf(semitones / 12.0);
        let rate = 1.0 - pitch_ratio;

        self.phase += rate;
        if self.phase >= half_size {
            self.phase -= half_size;
        } else if self.phase < 0.0 {
            self.phase += half_size;
        }

        let delay1 = self.phase;
        let delay2 = (self.phase + half_size * 0.5) % half_size;

        let w1 = 1.0 - (delay1 / (half_size * 0.5) - 1.0).abs().clamp(0.0, 1.0);
        let w2 = 1.0 - w1;

        let read_pos1 =
            (self.write_pos as f32 - delay1 + self.buf_size as f32) % self.buf_size as f32;
        let read_pos2 =
            (self.write_pos as f32 - delay2 + self.buf_size as f32) % self.buf_size as f32;

        let l1 = self.interpolate_l(read_pos1);
        let l2 = self.interpolate_l(read_pos2);
        let r1 = self.interpolate_r(read_pos1);
        let r2 = self.interpolate_r(read_pos2);

        self.write_pos = (self.write_pos + 1) % self.buf_size;

        (l1 * w1 + l2 * w2, r1 * w1 + r2 * w2)
    }

    #[inline]
    fn interpolate_l(&self, pos: f32) -> f32 {
        let idx0 = pos as usize;
        let idx1 = (idx0 + 1) % self.buf_size;
        let frac = pos - (idx0 as f32);
        self.buffer_l[idx0] * (1.0 - frac) + self.buffer_l[idx1] * frac
    }

    #[inline]
    fn interpolate_r(&self, pos: f32) -> f32 {
        let idx0 = pos as usize;
        let idx1 = (idx0 + 1) % self.buf_size;
        let frac = pos - (idx0 as f32);
        self.buffer_r[idx0] * (1.0 - frac) + self.buffer_r[idx1] * frac
    }
}

#[derive(Debug, Clone)]
pub struct KWeightingFilter {
    high_shelf_coeffs: BiquadCoeffs,
    rlb_coeffs: BiquadCoeffs,
    state_hs_l: ChannelFilterState,
    state_rlb_l: ChannelFilterState,
    state_hs_r: ChannelFilterState,
    state_rlb_r: ChannelFilterState,
}

impl KWeightingFilter {
    pub fn new(sample_rate: f32) -> Self {
        let sr = sample_rate.max(8000.0);

        // Stage 1: High shelf filter (head model) - ITU-R BS.1770
        // f0 = 1681.9744509555319 Hz, gain = 3.99984385397 dB
        let f0_hs = 1681.97445;
        let v_h = 10.0_f32.powf(3.99984385 / 20.0);
        let omega_hs = 2.0 * PI * f0_hs / sr;
        let k_hs = (omega_hs * 0.5).tan();
        let a0_hs = 1.0 + (2.0_f32).sqrt() * k_hs + k_hs * k_hs;
        let hs_coeffs = BiquadCoeffs {
            b0: (v_h + (2.0 * v_h).sqrt() * k_hs + k_hs * k_hs) / a0_hs,
            b1: (2.0 * (k_hs * k_hs - v_h)) / a0_hs,
            b2: (v_h - (2.0 * v_h).sqrt() * k_hs + k_hs * k_hs) / a0_hs,
            a1: (2.0 * (k_hs * k_hs - 1.0)) / a0_hs,
            a2: (1.0 - (2.0_f32).sqrt() * k_hs + k_hs * k_hs) / a0_hs,
        };

        // Stage 2: RLB weighting high-pass filter - ITU-R BS.1770
        // f0 = 38.13547087602444 Hz, Q = 0.50032703732539
        let f0_rlb = 38.13547;
        let q_rlb = 0.500327;
        let omega_rlb = 2.0 * PI * f0_rlb / sr;
        let k_rlb = (omega_rlb * 0.5).tan();
        let a0_rlb = 1.0 + k_rlb / q_rlb + k_rlb * k_rlb;
        let rlb_coeffs = BiquadCoeffs {
            b0: 1.0 / a0_rlb,
            b1: -2.0 / a0_rlb,
            b2: 1.0 / a0_rlb,
            a1: (2.0 * (k_rlb * k_rlb - 1.0)) / a0_rlb,
            a2: (1.0 - k_rlb / q_rlb + k_rlb * k_rlb) / a0_rlb,
        };

        Self {
            high_shelf_coeffs: hs_coeffs,
            rlb_coeffs,
            state_hs_l: ChannelFilterState::default(),
            state_rlb_l: ChannelFilterState::default(),
            state_hs_r: ChannelFilterState::default(),
            state_rlb_r: ChannelFilterState::default(),
        }
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32) -> (f32, f32) {
        let l_hs = self.state_hs_l.process(left, &self.high_shelf_coeffs);
        let l_k = self.state_rlb_l.process(l_hs, &self.rlb_coeffs);
        let r_hs = self.state_hs_r.process(right, &self.high_shelf_coeffs);
        let r_k = self.state_rlb_r.process(r_hs, &self.rlb_coeffs);
        (l_k, r_k)
    }

    #[inline]
    pub fn process_mono(&mut self, mono: f32) -> f32 {
        let m_hs = self.state_hs_l.process(mono, &self.high_shelf_coeffs);
        self.state_rlb_l.process(m_hs, &self.rlb_coeffs)
    }
}

#[derive(Debug, Clone)]
pub struct LoudnessNormalizer {
    k_filter: KWeightingFilter,
    power_ema: f32,
    alpha_power: f32,
    current_gain: f32,
    target_gain: f32,
    alpha_attack: f32,
    alpha_release: f32,
    sample_counter: usize,
}

impl LoudnessNormalizer {
    pub fn new(sample_rate: f32, target_lufs: f32) -> Self {
        let sr = sample_rate.max(8000.0);
        // Short-term loudness time constant ~ 1.5 seconds
        let tau_power = 1.5_f32;
        let alpha_power = 1.0 - (-1.0 / (tau_power * sr)).exp();

        // Fast attack (~100 ms) to pull back gain quickly on louder sections
        let tau_attack = 0.10_f32;
        let alpha_attack = 1.0 - (-1.0 / (tau_attack * sr)).exp();

        // Slow release (~2.0 s) to prevent breathing/pumping on quiet passages
        let tau_release = 2.0_f32;
        let alpha_release = 1.0 - (-1.0 / (tau_release * sr)).exp();

        // Initialize power to nominal target level so playback starts at unity gain (0 dB)
        let nominal_power = 10.0_f32.powf((target_lufs + 0.691) / 10.0).max(1.0e-5);

        Self {
            k_filter: KWeightingFilter::new(sr),
            power_ema: nominal_power,
            alpha_power,
            current_gain: 1.0,
            target_gain: 1.0,
            alpha_attack,
            alpha_release,
            sample_counter: 0,
        }
    }

    #[inline]
    pub fn process_stereo(&mut self, left: f32, right: f32, target_lufs: f32) -> (f32, f32) {
        let (k_l, k_r) = self.k_filter.process_stereo(left, right);
        let frame_power = 0.5 * (k_l * k_l + k_r * k_r);

        self.power_ema += self.alpha_power * (frame_power - self.power_ema);

        self.sample_counter += 1;
        if self.sample_counter >= 64 {
            self.sample_counter = 0;
            self.update_target_gain(target_lufs);
        }

        let alpha = if self.target_gain < self.current_gain {
            self.alpha_attack
        } else {
            self.alpha_release
        };
        self.current_gain += alpha * (self.target_gain - self.current_gain);

        (left * self.current_gain, right * self.current_gain)
    }

    #[inline]
    pub fn process_mono(&mut self, mono: f32, target_lufs: f32) -> f32 {
        let k_m = self.k_filter.process_mono(mono);
        let frame_power = k_m * k_m;

        self.power_ema += self.alpha_power * (frame_power - self.power_ema);

        self.sample_counter += 1;
        if self.sample_counter >= 64 {
            self.sample_counter = 0;
            self.update_target_gain(target_lufs);
        }

        let alpha = if self.target_gain < self.current_gain {
            self.alpha_attack
        } else {
            self.alpha_release
        };
        self.current_gain += alpha * (self.target_gain - self.current_gain);

        mono * self.current_gain
    }

    fn update_target_gain(&mut self, target_lufs: f32) {
        // Silence gate: EBU R128 specifies absolute threshold at -70 LUFS (~1.0e-7 power)
        const SILENCE_POWER_THRESHOLD: f32 = 1.0e-7;

        if self.power_ema <= SILENCE_POWER_THRESHOLD {
            // Signal is in a quiet pause, intro, or interlude.
            // Freeze target gain to avoid amplifying noise floor.
            self.target_gain = self.target_gain.min(1.0);
            return;
        }

        let measured_lufs = -0.691 + 10.0 * self.power_ema.log10();
        let diff_db = target_lufs - measured_lufs;

        // Clamp makeup gain: max +12.0 dB boost, down to -16.0 dB attenuation
        let clamped_diff_db = diff_db.clamp(-16.0, 12.0);
        self.target_gain = 10.0_f32.powf(clamped_diff_db / 20.0);
    }
}

pub struct DspFilterSource<I> {
    input: I,
    sample_rate: rodio::SampleRate,
    channels: rodio::ChannelCount,
    shared_config: Arc<RwLock<DspConfig>>,
    version: Arc<AtomicU64>,
    last_version: u64,
    active_config: DspConfig,
    sr_f32: f32,
    crossfeed_alpha: f32,
    coeffs: Vec<BiquadCoeffs>,
    states: Vec<Vec<ChannelFilterState>>,
    crossfeed_state: CrossfeedState,
    reverb: StereoFreeverb,
    pitch_shifter: StereoPitchShifter,
    loudness_normalizer: LoudnessNormalizer,
    pending_sample: Option<f32>,
    current_mono_channel: usize,
    samples_since_check: usize,
}

impl<I> DspFilterSource<I>
where
    I: Source<Item = f32>,
{
    pub fn new(input: I, shared_config: Arc<RwLock<DspConfig>>, version: Arc<AtomicU64>) -> Self {
        let sample_rate = input.sample_rate();
        let channels = input.channels();
        let sr_f32 = sample_rate.get() as f32;

        let active_config = match shared_config.read() {
            Ok(guard) => *guard,
            Err(_) => DspConfig::default(),
        };
        let last_version = version.load(Ordering::Relaxed);

        let omega = 2.0 * PI * 700.0 / sr_f32;
        let crossfeed_alpha = omega / (omega + 1.0);

        let mut coeffs = Vec::new();
        Self::compute_coeffs(&active_config, sr_f32, &mut coeffs);

        let num_filters = coeffs.len().max(12);
        let ch_count = channels.get() as usize;
        let states = vec![vec![ChannelFilterState::default(); num_filters]; ch_count.max(2)];
        let reverb = StereoFreeverb::new(sr_f32);
        let pitch_shifter = StereoPitchShifter::new(2048);
        let loudness_normalizer = LoudnessNormalizer::new(sr_f32, active_config.target_lufs);

        Self {
            input,
            sample_rate,
            channels,
            shared_config,
            version,
            last_version,
            active_config,
            sr_f32,
            crossfeed_alpha,
            coeffs,
            states,
            crossfeed_state: CrossfeedState::default(),
            reverb,
            pitch_shifter,
            loudness_normalizer,
            pending_sample: None,
            current_mono_channel: 0,
            samples_since_check: 0,
        }
    }

    fn compute_coeffs(config: &DspConfig, sr: f32, coeffs: &mut Vec<BiquadCoeffs>) {
        coeffs.clear();
        if !config.enabled {
            return;
        }

        let frequencies = [
            (32.0, config.bands.b32),
            (64.0, config.bands.b64),
            (125.0, config.bands.b125),
            (250.0, config.bands.b250),
            (500.0, config.bands.b500),
            (1000.0, config.bands.b1k),
            (2000.0, config.bands.b2k),
            (4000.0, config.bands.b4k),
            (8000.0, config.bands.b8k),
            (16000.0, config.bands.b16k),
        ];

        for (freq, gain) in frequencies {
            coeffs.push(BiquadCoeffs::peaking(sr, freq, gain, 1.4));
        }

        let bass_gain_db = (config.bass_boost / 100.0) * 12.0;
        coeffs.push(BiquadCoeffs::low_shelf(sr, 80.0, bass_gain_db));

        let clarity_gain_db = (config.clarity / 100.0) * 9.0;
        coeffs.push(BiquadCoeffs::high_shelf(sr, 9500.0, clarity_gain_db));
    }

    fn check_param_updates(&mut self) {
        self.samples_since_check += 1;
        if self.samples_since_check < 64 {
            return;
        }
        self.samples_since_check = 0;

        let cur_ver = self.version.load(Ordering::Relaxed);
        if cur_ver != self.last_version {
            if let Ok(guard) = self.shared_config.try_read() {
                self.active_config = *guard;
                self.last_version = cur_ver;
                Self::compute_coeffs(&self.active_config, self.sr_f32, &mut self.coeffs);
            }
        }
    }
}

impl<I> Iterator for DspFilterSource<I>
where
    I: Source<Item = f32>,
{
    type Item = f32;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        self.check_param_updates();

        if self.channels.get() == 2 {
            if let Some(pending) = self.pending_sample.take() {
                return Some(pending);
            }

            let left_in = self.input.next()?;
            let right_in = match self.input.next() {
                Some(r) => r,
                None => 0.0,
            };

            if !self.active_config.enabled {
                self.pending_sample = Some(right_in);
                return Some(left_in);
            }

            let mut left = left_in;
            let mut right = right_in;

            let filter_count = self.coeffs.len();
            for idx in 0..filter_count {
                let coeff = &self.coeffs[idx];
                left = self.states[0][idx].process(left, coeff);
                right = self.states[1][idx].process(right, coeff);
            }

            if self.active_config.tube_warmth > 0.001 {
                left = apply_tube_warmth(left, self.active_config.tube_warmth);
                right = apply_tube_warmth(right, self.active_config.tube_warmth);
            }

            if (self.active_config.stereo_width - 100.0).abs() > 0.1 {
                let mid = 0.5 * (left + right);
                let side = 0.5 * (left - right);
                let width_factor = (self.active_config.stereo_width / 100.0).clamp(0.0, 2.0);
                left = mid + side * width_factor;
                right = mid - side * width_factor;
            }

            if self.active_config.crossfeed {
                let (cf_l, cf_r) = self
                    .crossfeed_state
                    .process(left, right, self.crossfeed_alpha);
                left = cf_l;
                right = cf_r;
            }

            if self.active_config.reverb_wet > 0.001 {
                let wet_amt = (self.active_config.reverb_wet / 100.0).clamp(0.0, 1.0);
                let room = (self.active_config.reverb_size / 100.0).clamp(0.0, 1.0);
                let damp = (self.active_config.reverb_damp / 100.0).clamp(0.0, 1.0);
                let (rev_l, rev_r) = self.reverb.process(left, right, room, damp);
                left = left * (1.0 - wet_amt * 0.4) + rev_l * (wet_amt * 0.5);
                right = right * (1.0 - wet_amt * 0.4) + rev_r * (wet_amt * 0.5);
            }

            if self.active_config.pitch_shift.abs() > 0.05 {
                let (ps_l, ps_r) =
                    self.pitch_shifter
                        .process(left, right, self.active_config.pitch_shift);
                left = ps_l;
                right = ps_r;
            }

            if self.active_config.loudness_normalization {
                let (norm_l, norm_r) = self.loudness_normalizer.process_stereo(
                    left,
                    right,
                    self.active_config.target_lufs,
                );
                left = norm_l;
                right = norm_r;
            }

            if self.active_config.limiter {
                left = apply_soft_limiter(left);
                right = apply_soft_limiter(right);
            } else {
                left = left.clamp(-1.0, 1.0);
                right = right.clamp(-1.0, 1.0);
            }

            self.pending_sample = Some(right);
            Some(left)
        } else {
            let sample = self.input.next()?;
            if !self.active_config.enabled {
                return Some(sample);
            }

            let ch = self.current_mono_channel;
            self.current_mono_channel =
                (self.current_mono_channel + 1) % (self.channels.get() as usize);

            let mut out = sample;
            let ch_idx = ch.min(self.states.len() - 1);
            for (idx, coeff) in self.coeffs.iter().enumerate() {
                out = self.states[ch_idx][idx].process(out, coeff);
            }

            if self.active_config.tube_warmth > 0.001 {
                out = apply_tube_warmth(out, self.active_config.tube_warmth);
            }

            if self.active_config.pitch_shift.abs() > 0.05 {
                let (ps_out, _) =
                    self.pitch_shifter
                        .process(out, out, self.active_config.pitch_shift);
                out = ps_out;
            }

            if self.active_config.loudness_normalization {
                out = self.loudness_normalizer.process_mono(
                    out,
                    self.active_config.target_lufs,
                );
            }

            if self.active_config.limiter {
                out = apply_soft_limiter(out);
            } else {
                out = out.clamp(-1.0, 1.0);
            }

            Some(out)
        }
    }
}

impl<I> Source for DspFilterSource<I>
where
    I: Source<Item = f32>,
{
    #[inline]
    fn current_span_len(&self) -> Option<usize> {
        self.input.current_span_len()
    }

    #[inline]
    fn channels(&self) -> rodio::ChannelCount {
        self.channels
    }

    #[inline]
    fn sample_rate(&self) -> rodio::SampleRate {
        self.sample_rate
    }

    #[inline]
    fn total_duration(&self) -> Option<std::time::Duration> {
        self.input.total_duration()
    }

    #[inline]
    fn try_seek(&mut self, pos: std::time::Duration) -> Result<(), rodio::source::SeekError> {
        self.pending_sample = None;
        for ch in &mut self.states {
            for state in ch {
                state.reset();
            }
        }
        self.crossfeed_state.reset();
        self.reverb.reset();
        self.input.try_seek(pos)
    }
}
