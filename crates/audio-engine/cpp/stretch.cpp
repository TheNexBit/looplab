// C interface to Signalsmith Stretch for Rust (see src/dsp/stretch.rs).
// Buffers are interleaved; lengths are in frames (samples per channel).
// Nothing here allocates after `looplab_stretch_new`, as long as each call
// passes at most `looplab_stretch_max_block` frames.

#include "signalsmith-stretch/signalsmith-stretch.h"

namespace {

// Lets the library index an interleaved buffer as buffer[channel][frame].
template <class T>
struct Interleaved {
    T *data;
    int channels;

    struct Channel {
        T *data;
        int channels;
        T &operator[](int frame) const { return data[frame * channels]; }
    };

    Channel operator[](int channel) const { return {data + channel, channels}; }
};

} // namespace

struct looplab_stretch {
    signalsmith::stretch::SignalsmithStretch<float> stretch;
    int channels;
};

extern "C" {

looplab_stretch *looplab_stretch_new(int channels, float sample_rate) {
    auto *handle = new looplab_stretch;
    handle->channels = channels;
    // Split computation spreads the FFT work evenly over calls: no CPU spikes in the audio thread
    handle->stretch.presetDefault(channels, sample_rate, true);
    return handle;
}

void looplab_stretch_free(looplab_stretch *handle) { delete handle; }

void looplab_stretch_reset(looplab_stretch *handle) { handle->stretch.reset(); }

int looplab_stretch_input_latency(const looplab_stretch *handle) {
    return handle->stretch.inputLatency();
}

int looplab_stretch_output_latency(const looplab_stretch *handle) {
    return handle->stretch.outputLatency();
}

/// Largest input or output length a single call may use without allocating.
int looplab_stretch_max_block(const looplab_stretch *handle) {
    return handle->stretch.blockSamples() + handle->stretch.intervalSamples();
}

void looplab_stretch_set_transpose(looplab_stretch *handle, float factor) {
    handle->stretch.setTransposeFactor(factor);
}

void looplab_stretch_seek(looplab_stretch *handle, const float *input, int frames, double rate) {
    handle->stretch.seek(Interleaved<const float>{input, handle->channels}, frames, rate);
}

void looplab_stretch_process(looplab_stretch *handle, const float *input, int input_frames,
                             float *output, int output_frames) {
    handle->stretch.process(Interleaved<const float>{input, handle->channels}, input_frames,
                            Interleaved<float>{output, handle->channels}, output_frames);
}

} // extern "C"
