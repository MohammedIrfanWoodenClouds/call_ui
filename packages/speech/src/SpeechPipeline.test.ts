import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpeechPipeline } from "./SpeechPipeline.js";
import type { AcousticTurnMetrics } from "./core.js";

const clearSpeech: AcousticTurnMetrics = {
  speechConfidence: "High",
  backgroundNoiseLevel: "Low",
  backgroundNoiseDbfs: -52,
  micRms: 0.08,
  noiseRms: 0.0025,
  vadTriggerReason: "continuous_human_speech_260ms_dominance_0.9",
  speechDurationMs: 850,
  continuousSpeechMs: 300,
  averageSnrDb: 20,
  speakerDominance: 0.88,
  voiceFrameRatio: 0.7,
};

describe("SpeechPipeline", () => {
  it("never exposes raw STT as conversation text when digits are preferred", () => {
    const pipeline = new SpeechPipeline();
    const turn = pipeline.finalizeTurn({
      rawTranscript: "seven zero one two eight four three seven two seven",
      acoustics: clearSpeech,
      phase: "mobile",
      numberCollection: {
        active: true,
        stage: "collecting",
        candidate: "",
      },
    });
    assert.equal(turn.discard, false);
    assert.equal(turn.text, "7012843727");
    assert.match(turn.rawText, /seven/i);
    assert.notEqual(turn.text, turn.rawText);
  });

  it("discards echo against recent assistant speech", () => {
    const pipeline = new SpeechPipeline();
    const assistant =
      "നമസ്കാരം, ഞാൻ ഡബ്ല്യൂസി എഐയിൽ നിന്ന് അഞ്ജന ആണ്";
    const turn = pipeline.finalizeTurn({
      rawTranscript: assistant,
      acoustics: clearSpeech,
      recentAssistant: [
        { text: assistant, recordedAt: Date.now() - 500 },
      ],
    });
    assert.equal(turn.discard, true);
    assert.equal(turn.text, "");
    assert.ok(turn.echo?.isEcho);
  });

  it("attaches Kerala name candidates on name phase", () => {
    const pipeline = new SpeechPipeline();
    const turn = pipeline.finalizeTurn({
      rawTranscript: "Mohamed",
      acoustics: clearSpeech,
      phase: "name",
    });
    assert.equal(turn.discard, false);
    assert.ok(turn.entities.nameCandidates.length > 0);
  });
});
