import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config({ path: "apps/web/.env.local" });

const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
if (!apiKey || apiKey === "YOUR_KEY_HERE") {
  console.error("No valid API key found in apps/web/.env.local");
  process.exit(1);
}

// Check both v1alpha and v1beta
for (const apiVersion of ["v1beta", "v1alpha"]) {
  console.log(`\n--- Models supporting bidiGenerateContent in ${apiVersion} ---`);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion } });
  
  try {
    const list = await ai.models.list();
    // @ts-ignore - Some supportedGenerationMethods might not be typed properly
    const liveModels = list.filter(m => 
      m.supportedGenerationMethods?.includes("bidiGenerateContent")
    );
    
    if (liveModels.length === 0) {
      console.log(`No live models found in ${apiVersion}`);
    } else {
      liveModels.forEach(m => console.log(`- ${m.name}`));
    }
  } catch (err) {
    console.error(`Error listing ${apiVersion} models:`, err.message);
  }
}
