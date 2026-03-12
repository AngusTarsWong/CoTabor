import React from 'react';

const App: React.FC = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>CoTabor</h1>
      <p>Hello World! This is your automation assistant.</p>
      <button onClick={() => alert('Hello!')}>Click Me</button>
    </div>
  );
};

export default App;
