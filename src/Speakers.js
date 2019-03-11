import RingBuffer from "ringbufferjs";
import { handleError } from "./utils";

export default class Speakers {
  constructor({ onBufferUnderrun }) {
    this.onBufferUnderrun = onBufferUnderrun;
    this.bufferSize = 8192;
    this.buffer = new RingBuffer(this.bufferSize * 2);
    this.running = false;
    this.audioStartTimeout = null;
  }

  start() {
    // Audio is not supported
    if (!window.AudioContext) {
      return;
    }
    this.audioCtx = new window.AudioContext();

    if ("suspended" === this.audioCtx.status) {
      this.audioCtx.close();
      this.audioStartTimeout = setTimeout(this.start.bind(this), 500);
      return;
    }
    this.running = true;

    this.scriptNode = this.audioCtx.createScriptProcessor(1024, 0, 2);
    this.scriptNode.onaudioprocess = this.onaudioprocess;
    this.scriptNode.connect(this.audioCtx.destination);
  }

  stop() {
    if (this.audioStartTimeout) {
      clearTimeout(this.audioStartTimeout);
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect(this.audioCtx.destination);
      this.scriptNode.onaudioprocess = null;
      this.scriptNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(handleError);
      this.audioCtx = null;
    }
  }

  writeSample = (left, right) => {
    if (!this.running) {
      return;
    }
    if (this.buffer.size() / 2 >= this.bufferSize) {
      console.log(`Buffer overrun`);
    }
    this.buffer.enq(left);
    this.buffer.enq(right);
  };

  onaudioprocess = e => {
    var left = e.outputBuffer.getChannelData(0);
    var right = e.outputBuffer.getChannelData(1);
    var size = left.length;

    // We're going to buffer underrun. Attempt to fill the buffer.
    if (this.buffer.size() < size * 2 && this.onBufferUnderrun) {
      this.onBufferUnderrun(this.buffer.size(), size * 2);
    }

    try {
      var samples = this.buffer.deqN(size * 2);
    } catch (e) {
      // onBufferUnderrun failed to fill the buffer, so handle a real buffer
      // underrun

      // ignore empty buffers... assume audio has just stopped
      var bufferSize = this.buffer.size() / 2;
      if (bufferSize > 0) {
        console.log(`Buffer underrun (needed ${size}, got ${bufferSize})`);
      }
      for (var j = 0; j < size; j++) {
        left[j] = 0;
        right[j] = 0;
      }
      return;
    }
    for (var i = 0; i < size; i++) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
  };
}
