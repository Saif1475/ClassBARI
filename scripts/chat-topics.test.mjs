import assert from "node:assert/strict";
import { test } from "node:test";
import { topicOf } from "../src/lib/chat-topics.ts";

test("chats go to the folder of their topic, in English or Bangla", () => {
  assert.equal(topicOf("Explain Newton's second law with an example"), "physics");
  assert.equal(topicOf("What are standing waves?"), "physics");
  assert.equal(topicOf("তরঙ্গের বেগ কীভাবে বের করব?"), "physics");
  assert.equal(topicOf("Balance this reaction: H2 + O2"), "chemistry");
  assert.equal(topicOf("এই সমীকরণটি সমাধান করো"), "math");
  assert.equal(topicOf("integrate x sin x"), "math");
  assert.equal(topicOf("How does photosynthesis work?"), "biology");
  assert.equal(topicOf("Change this sentence to passive voice and fix the tense"), "english");
  assert.equal(topicOf("সমাস কাকে বলে?"), "bangla");
  assert.equal(topicOf("Write a python loop to print 1 to 10"), "ict");
  assert.equal(topicOf("Make me a 7-day revision plan for my exam"), "plans");
  assert.equal(topicOf("Make me a revision plan for physics waves and light"), "physics");
  assert.equal(topicOf("hello"), "other");
  assert.equal(topicOf("আমাকে কিছু বলো"), "other"); // "বলো" (say) is not "বল" (force)
});

test("the example chats fill several folders", async () => {
  const { sampleChats } = await import("../src/lib/sample-chats.ts");
  const topics = sampleChats().map((c) => c.topic);
  assert.deepEqual([...new Set(topics)].sort(), ["bangla", "biology", "chemistry", "english", "math", "other", "physics", "plans"]);
  assert.equal(topics.filter((t) => t === "physics").length, 2);
  assert.equal(topics.filter((t) => t === "math").length, 2);
});
