import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
if (!apiKey || apiKey === "YOUR_KEY_HERE") {
  console.error("No valid API key found!");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });

async function run() {
  console.log("Checking v1alpha models...");
  try {
    const list = await ai.models.list();
    for await (const m of list) {
      if (m.name.includes("flash") || m.name.includes("live")) {
        console.log(`Model: ${m.name}`);
        console.log(` - Methods: ${m.supportedGenerationMethods?.join(", ") || "none"}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
