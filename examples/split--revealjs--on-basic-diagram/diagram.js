import basic from "example-direct--basic-diagram/definition";

// Only what differs from the base diagram: embedded, and a deck-wide start.
export default basic.extend({
  features: "embed",
  baseState: { camera: { fit: true } },
  views: {
    "cache-path": { title: "Cache path", state: { camera: { focus: { tags: ["Data.Cache"] }, padding: 0.3 }, onlyTags: ["Data"] } },
  },
});
