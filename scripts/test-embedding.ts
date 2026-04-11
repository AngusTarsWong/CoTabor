import "dotenv/config";
import { VolcengineEmbeddingProvider } from "../src/memory/rag/embedding";

async function testEmbedding() {
  console.log("Testing Volcengine Multimodal Embedding...");
  const provider = new VolcengineEmbeddingProvider();

  try {
    // 1. Test Text Only
    console.log("\n1. Testing Text Input...");
    const textVector = await provider.getEmbedding("天很蓝，海很深");
    console.log(`✅ Text Vector received! Dimension: ${textVector.length}`);
    console.log(`First 5 values: ${textVector.slice(0, 5).join(", ")}`);

    // 2. Test Multimodal (Text + Image)
    console.log("\n2. Testing Multimodal Input (Text + Image)...");
    const multimodalVector = await provider.getEmbedding([
      { type: "text", text: "天很蓝，海很深" },
      { type: "image_url", image_url: { url: "https://ark-project.tos-cn-beijing.volces.com/images/view.jpeg" } }
    ]);
    console.log(`✅ Multimodal Vector received! Dimension: ${multimodalVector.length}`);
    console.log(`First 5 values: ${multimodalVector.slice(0, 5).join(", ")}`);

    console.log("\n🎉 All Embedding Tests Passed!");
  } catch (error) {
    console.error("❌ Test Failed:", error);
  }
}

testEmbedding();
