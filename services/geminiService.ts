import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedProblem, SelectionState } from "../types";

// Initialize Gemini Client
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please set process.env.API_KEY.");
  }
  return new GoogleGenAI({ apiKey });
};

// Common schema for both text and image modes
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    question: {
      type: Type.STRING,
      description: "The main text. Use Markdown. WRAP MATH IN $...$. NO IMG TAGS."
    },
    choices: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Array of 5 options. Leave EMPTY for subjective. WRAP MATH IN $...$."
    },
    answer: {
      type: Type.STRING,
      description: "The final answer. IF OBJECTIVE: Include number (e.g., '(3) ...'). IF SUBJECTIVE: Just the value."
    },
    solution: {
      type: Type.STRING,
      description: "Detailed step-by-step solution. MUST USE NEWLINES BETWEEN STEPS."
    },
    topic: {
      type: Type.STRING,
      description: "Topic label derived from image or selection."
    },
    difficulty: {
      type: Type.STRING,
      description: "Difficulty level."
    },
    diagramSVG: {
      type: Type.STRING,
      description: "SVG code or null. For fractions, construct them vertically using text/line elements.",
      nullable: true
    }
  },
  required: ["question", "answer", "solution", "topic", "difficulty"]
};

const buildTextPrompt = (selection: SelectionState): string => {
  const topicPath = `${selection.schoolLevel} ${selection.grade} > ${selection.mainUnit} > ${selection.subUnit} > ${selection.detailUnit}`;
  
  return `
    You are an expert Mathematics Teacher in South Korea, specializing in the "2022 Revised National Curriculum" (2022 개정 교육과정).
    
    Task: Create a mathematics problem based on the following specifications.
    
    Target Audience/Topic:
    - Curriculum Path: ${topicPath}
    - Difficulty: ${selection.difficulty} (Range: Lower, Middle, High, Highest)
    - Problem Goal: ${selection.problemType}
    - Question Format: ${selection.answerType}
    
    ${COMMON_INSTRUCTIONS}
  `;
};

const buildExactPrompt = (removeScore?: boolean): string => {
  const scoreInstruction = removeScore 
    ? `\n       - **CRITICAL**: Remove any score or points mentioned in the problem text (e.g., "(10점)", "[5점]", "4점"). Do NOT include them in the output.`
    : ``;

  return `
    You are an expert Mathematics Teacher in South Korea.
    
    Task: Extract and convert the provided image of a math problem into **EXACTLY THE SAME** problem in text format.
    
    1. **Extract**: Read the problem text, choices, and any mathematical formulas exactly as they appear in the image.${scoreInstruction}
       - **Formatting**: Combine text into natural paragraphs. Do NOT force line breaks just to match the visual width of the image. Let the text wrap naturally.
       - If there is a box, use blockquotes. If there is a dialogue, keep each person's speech on a new line.
    2. **Format**: Convert the extracted content into the required JSON format.
       - Do NOT change the numbers, functions, or context.
       - If there are choices in the image, put them in the "choices" array. If there are no choices, leave it empty [].
       - If there is a diagram, recreate it using SVG in the "diagramSVG" field, or leave it null if not possible or not present.
       - Provide the correct answer and a detailed solution for the problem.
       - Estimate the topic and difficulty level.
    
    ${COMMON_INSTRUCTIONS}
  `;
};

const buildImagePrompt = (selection: SelectionState): string => {
  return `
    You are an expert Mathematics Teacher in South Korea.
    
    Task: Analyze the provided image of a math problem and generate a **NEW, SIMILAR** problem.
    
    1. **Analyze**: Identify the mathematical concept, topic, and difficulty level of the problem in the image.
    2. **Generate**: Create a **NEW** problem that tests the **same concept** and has a **similar difficulty**.
       - Do NOT just solve the problem in the image.
       - Do NOT copy the problem exactly. Change numbers, functions, or context while keeping the core logic similar.
    3. **Constraint Override**:
       - Target Difficulty: ${selection.difficulty} (Adjust the generated problem to match this difficulty if possible, otherwise stick to the image's level).
       - Question Format: ${selection.answerType} (Force the output to be this format).
    
    ${COMMON_INSTRUCTIONS}
  `;
};

const COMMON_INSTRUCTIONS = `
    Requirements:
    1. The problem must be mathematically accurate and suitable for Korean students.
    2. [Text Formatting & LaTeX - CRITICAL]
       - Use LaTeX formatting for **ALL** mathematical expressions, numbers, variables, and formulas in the Question/Answer/Solution text.
       - **Inline Math**: Wrap in single dollar signs, e.g., $x^2 + 2x + 1$.
       - **Block Math**: Wrap in double dollar signs, e.g., $$ \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$.
       - **CHOICES (보기)**: You MUST wrap the mathematical content of each choice in $ symbols. 
         - Incorrect: "x^2 + x" 
         - Correct: "$x^2 + x$"
       - **NO IMAGES IN TEXT**: Do NOT include <img> tags, Markdown images (![...](...)), or placeholders like "[Diagram]" in the "question" or "solution" fields.
    
    3. [Question Format Rules - CRITICAL]
       - **If Question Format is '객관식 (5지선다)'**:
         - You MUST provide exactly 5 choices in the "choices" array.
         - The answer must be one of these choices.
       - **If Question Format is '주관식/서술형'**:
         - The "choices" array MUST be empty [].
         
    4. [Layout, Line Breaks & Boxed Content - CRITICAL]
       - **Line Breaks**: Separate distinct logical paragraphs or conditions using double newlines (\\n\\n). Do NOT force line breaks mid-sentence just to mimic the visual wrapping of the original image/text. Let it flow naturally.
       - **Dialogues**: If the problem contains a dialogue (e.g., Person A: ..., Person B: ...), each speaker's line MUST be on a new line separated by double newlines (\\n\\n).
       - **Boxed Content**: If ANY part of the problem is enclosed in a box (like <보기>, a dialogue box, or a condition box), you MUST wrap that entire section in a Markdown Blockquote (>).
         Example:
         > 솔이: 내 사물함의 비밀번호는 ...
         >
         > 정우: 힌트 좀 줘.
    
    5. [Visuals & Diagrams - HIGH QUALITY REQUIRED]
       - **When to generate**: If the topic involves **Geometry** (Plane/Solid), **Functions** (Graphs), or **Statistics** (Charts/Histograms).
       - **SVG Requirements**:
         - **Code**: Provide raw, valid SVG string in "diagramSVG".
         - **Style**: 
           - **ViewBox**: Appropriately sized (e.g., "0 0 400 300"). Ensure enough width for composite diagrams.
           - **Stroke**: Black (#000). Main object lines: width **2px**. Axes/Auxiliary lines: width **1px**.
           - **Background**: Transparent.
         - **Layout & Spacing (CRITICAL)**:
           - **Object Separation**: When drawing transformations (e.g., Cube -> Arrow -> Net), you MUST provide ample spacing.
           - **Arrow Clearance**: The arrow must have at least **30px of whitespace** on both the left and right sides. It must NOT touch the objects.
           - **Alignment**: Center align the objects vertically relative to the arrow.
         - **Text Labels (CRITICAL - FRACTIONS)**:
           - **NO LaTeX in SVG**: Browsers CANNOT render LaTeX ($...$) inside SVG <text>.
           - **Fractions**: You MUST render fractions **VERTICALLY** using pure SVG elements.
             - **Do NOT** use slash notation (e.g., "π/6").
             - **CONSTRUCT THEM MANUALLY**:
               1. Draw Numerator <text> centered at (x, y).
               2. Draw Horizontal <line> separator below numerator.
               3. Draw Denominator <text> centered below line.
             - Example Logic:
               <text x="50" y="45" text-anchor="middle" font-size="12">π</text>
               <line x1="42" y1="50" x2="58" y2="50" stroke="black" stroke-width="1"/>
               <text x="50" y="62" text-anchor="middle" font-size="12">6</text>
           - **Symbols**: Use Unicode (π, θ, √, α, β).
           - **Readability**: Ensure font-size is large enough (>= 14px) and labels do not overlap lines.

    6. [Solution Quality - WORKBOOK STYLE]
       - Provide a professional, detailed solution similar to famous Korean workbooks (like Ssen, Black Label).
       - **Formatting (CRITICAL)**:
         - **You MUST insert a blank line (double newline \\n\\n) BEFORE starting a new step or header.**
         - Ensure the text is NOT one large block. Visually separate each logical step.
       - **Answer Field**: 
         - **If Multiple Choice**: MUST start with the choice number in parentheses or circled number, followed by the value (e.g., "(3) 5" or "③ 5").
         - **If Subjective**: Strictly contain the final result (e.g., "5", "$4\\pi$", "x=2"). Do not include the full sentence "The answer is...".

    7. The output MUST be valid JSON.
    
    Language: Korean (한국어)
`;

export const generateMathProblem = async (selection: SelectionState): Promise<GeneratedProblem> => {
  const ai = getClient();
  let contents: any;

  if ((selection.mode === 'image' || selection.mode === 'exact') && selection.sourceImage) {
    // Image or Exact Mode
    const base64Data = selection.sourceImage.split(',')[1];
    // Simple MIME type detection based on header
    const mimeMatch = selection.sourceImage.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    contents = {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        { text: selection.mode === 'exact' ? buildExactPrompt(selection.removeScore) : buildImagePrompt(selection) }
      ]
    };
  } else {
    // Text Mode
    contents = buildTextPrompt(selection);
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    if (!response.text) {
      throw new Error("No content generated.");
    }

    let jsonString = response.text.trim();
    if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const data = JSON.parse(jsonString) as GeneratedProblem;

    // Helper to sanitize text fields
    const sanitizeText = (text: string) => {
      if (!text) return text;
      return text
        .replace(/<img[^>]*>/gi, '') // Remove HTML img tags
        .replace(/!\[.*?\]\(.*?\)/g, '') // Remove Markdown images
        .replace(/<center>\s*<\/center>/gi, '') // Remove empty center tags
        .trim();
    };

    // Sanitize fields to prevent broken image icons
    if (data.question) data.question = sanitizeText(data.question);
    if (data.solution) data.solution = sanitizeText(data.solution);

    // Clean up SVG if it contains markdown code blocks
    if (data.diagramSVG) {
      data.diagramSVG = data.diagramSVG
        .replace(/^```(xml|svg)?/i, '')
        .replace(/```$/, '')
        .trim();
    }

    return data;
  } catch (error) {
    console.error("Error generating problem:", error);
    throw error;
  }
};