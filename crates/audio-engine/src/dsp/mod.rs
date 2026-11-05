//! Signal processing of the playback chain: stretch → EQ → channels.
//!
//! A future source-separation stage (AI stems) would sit before the stretch,
//! working on the decoded track, so none of these stages needs to change.

pub mod biquad;
pub mod channels;
pub mod eq;
pub mod stretch;
