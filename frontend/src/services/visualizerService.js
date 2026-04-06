import { GoogleGenAI, Modality } from "@google/genai";

// Initialize Gemini Client using Vite environment variables
const getAiClient = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

/**
 * Fetch the file tree of a GitHub repository
 */
export async function fetchRepoFileTree(owner, repo) {
  const branches = ['main', 'master'];

  for (const branch of branches) {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);

      if (response.ok) {
        const data = await response.json();
        
        return (data.tree || []).filter((item) => 
          item.type === 'blob' && 
          item.path.match(/\.(js|jsx|ts|tsx|py|go|rs|java|c|cpp|h|hpp|cs|php|rb|swift|kt|dart|json|yaml|yml|toml|xml|html|css)$/i) &&
          !item.path.includes('node_modules') &&
          !item.path.includes('dist/') &&
          !item.path.includes('build/') &&
          !item.path.startsWith('.')
        );
      }

      if (response.status === 403 || response.status === 429) {
        throw new Error('GitHub API rate limit exceeded.');
      }
    } catch (error) {
      if (error.message.includes('rate limit')) throw error;
    }
  }

  throw new Error(`Failed to fetch repository. It might be private or using a non-standard branch.`);
}

/**
 * Generate infographic from file tree
 */
export async function generateInfographic(repoName, fileTree) {
  const ai = getAiClient();
  const limitedTree = fileTree.slice(0, 150).map(f => f.path).join(', ');
  
  const prompt = `Create a highly detailed technical logical data flow diagram infographic for GitHub repository : "${repoName}".
  
  STRICT VISUAL STYLE GUIDELINES:
  VISUAL STYLE: Neon Cyberpunk. Dark mode cyberpunk. Black background with glowing neon pink, cyan, and violet lines and nodes. High contrast, futuristic look.
  - LAYOUT: Distinct Left-to-Right flow.
  - CENTRAL CONTAINER: Group core logic inside a clearly defined central area.
  - ICONS: Use relevant technical icons (databases, servers, code files, users).
  - TYPOGRAPHY: Highly readable technical font. Must be in English.
  
  Perspective: Clean 2D flat diagrammatic view straight-on. No 3D effects.
  
  Repository Context: ${limitedTree}...
  
  Diagram Content Requirements:
  1. Title exactly: "${repoName} Data Flow"
  2. Visually map the likely data flow based on the provided file structure.
  3. Ensure the "Input -> Processing -> Output" structure is clear.
  4. Add short, clear text labels to connecting arrows indicating data type.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return part.inlineData.data; // Base64 image
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Gemini infographic generation failed:", error);
    throw error;
  }
}
