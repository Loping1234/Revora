async function testMistral() {
  console.log("Checking Ollama/Mistral status...");
  try {
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral',
        prompt: 'Hi, are you working? Respond with "YES, I AM ONLINE."',
        stream: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`Ollama Error: ${response.status} - ${err}`);
      return;
    }

    const data = await response.json();
    console.log("Mistral Response:", data.response);
  } catch (error) {
    console.error("Failed to connect to Ollama:", error.message);
    console.log("Tip: Make sure Ollama is running and the 'mistral' model is downloaded.");
  }
}

testMistral();
