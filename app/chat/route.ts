import { NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";

const systemPrompt = `
Understanding the Query:

Analyze the user's question to identify key factors such as subject, rating preferences, or specific qualities they are looking for in a professor (e.g., teaching style, ease of course, engagement).
Retrieving Relevant Data:

Use RAG to fetch relevant information from a database of professor reviews. Focus on the most recent and relevant data to ensure accuracy.
Generating Recommendations:

Provide the top 3 professor recommendations based on the query. Each recommendation should include:
Professor's Name
Subject they teach
Average Rating (0-5 stars)
A Brief Summary of student feedback that highlights key points such as teaching style, difficulty, and overall satisfaction.
Additional Considerations:

If the user’s query is too broad, ask clarifying questions to narrow down the search.
If no relevant professors are found, suggest alternative subjects or criteria the user may consider.
Always be polite and helpful in your responses, guiding students to make informed decisions.
Example Interaction:

User Query: "I'm looking for a professor who teaches Data Structures and is really good at explaining complex topics."

AI Response: "Here are the top 3 professors for Data Structures who excel at explaining complex topics:

Dr. Emily Johnson – Data Structures – ⭐️ 4.9/5
Students praise Dr. Johnson for her ability to break down complex topics into easy-to-understand concepts. Her lectures are engaging and thorough.
Dr. Robert Brown – Data Structures – ⭐️ 4.7/5
Known for his clear explanations and helpful office hours, Dr. Brown makes sure every student grasps the material.
Dr. Linda Wilson – Data Structures – ⭐️ 4.6/5
Dr. Wilson is appreciated for her detailed lecture slides and practical examples that make difficult topics more approachable."`;

export async function POST(req: Request) {
  const data = await req.json();
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY || "",
  });
  const index = pc.index("rag").namespace("ns1");
  const openai = new OpenAI();

  const text = data[data.length - 1].content;
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
    encoding_format: "float",
  });
  const results = await index.query({
    topK: 3,
    includeMetadata: true,
    vector: embedding.data[0].embedding,
  });

  let resultString =
    "\n\nReturned results from vector db (done automatically):";
  results.matches.forEach((match) => {
    resultString += `\n\n
        Professor: ${match.id}
        Review: ${match.metadata?.review}
        Subject: ${match.metadata?.subject}
        Stars: ${match.metadata?.stars}
        \n\n 
        `;
  });

  const lastMessage = data[data.length - 1];
  const lastMessageContent = lastMessage.content + resultString;
  const lastDataWithoutLastMessage = data.slice(0, data.length - 1);
  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...lastDataWithoutLastMessage,
      { role: "user", content: lastMessageContent },
    ],
    model: "gpt-4o-mini",
    stream: true,
  });
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of completion) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            const text = encoder.encode(content);
            controller.enqueue(text);
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
  return new NextResponse(stream);
}
