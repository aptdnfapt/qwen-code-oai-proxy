const OpenAI = require('openai');

async function testStreamingFix() {
  console.log('Testing streaming fix with Qwen OpenAI Proxy...');
  
  // Create OpenAI client pointing to our proxy
  const openai = new OpenAI({
    apiKey: 'fake-api-key', // Not actually used, but required by OpenAI client
    baseURL: 'http://localhost:8080/v1' // Point to our proxy
  });
  
  try {
    // Test streaming chat completion
    console.log('\nTesting streaming chat completion...');
    const stream = await openai.chat.completions.create({
      model: 'qwen3-coder-plus',
      messages: [
        {"role": "user", "content": "Count from 1 to 100, with a brief pause between each number. Number: "}
      ],
      temperature: 0.7,
      stream: true
    });
    
    console.log('Streaming response:');
    let chunkCount = 0;
    
    // Process the stream
    for await (const chunk of stream) {
      chunkCount++;
      if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
        process.stdout.write(chunk.choices[0].delta.content);
      }
    }
    
    console.log('\n\n✅ Streaming chat completion completed!');
    console.log(`Total chunks received: ${chunkCount}`);
    
  } catch (error) {
    console.error('Test failed:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\nIt looks like the proxy server is not running.');
      console.log('Please start the proxy server with: npm start');
    }
  }
}

testStreamingFix();