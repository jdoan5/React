import React, { useState, useRef } from 'react';
import './App.css';

function App() {
  const [result, setResult] = useState(0);
  const inputRef = useRef(null);

  function plus(e) {
    e.preventDefault();
    const inputVal = Number(inputRef.current.value);
    setResult((result) => result + inputVal);
  }

  function minus(e) {
    e.preventDefault();
    const inputVal = inputRef.current.value;
    setResult((result) => result - inputVal);
  }

  function times(e) {
    e.preventDefault();
    const inputVal = inputRef.current.value;
    setResult((result) => result * inputVal);
  }

  function divide(e) {
    e.preventDefault();
    const inputVal = Number(inputRef.current.value);
    if (inputVal === 0) {
      alert('Cannot divide by zero');
      return;
    }
    setResult((result) => result / inputVal);
  }

  const resetInput = (e) => {
    e.preventDefault();
    inputRef.current.value = '';
  };

  function resetResult(e) {
    e.preventDefault();
    setResult(0); // Kept as a number
  }

  return (
    <div className="App">
      <div>
        <h1>Simplest Working Calculator</h1>
      </div>
      <form>
        <h3>{result}</h3>
        <input
          ref={inputRef}
          pattern="[0-9]"
          type="number"
          placeholder="Type a number"
        />
        <button onClick={plus}>add</button>
        <button onClick={minus}>subtract</button>
        <button onClick={times}>multiply</button>
        <button onClick={divide}>divide</button>
        <button className="reset-input" onClick={resetInput}>
          Reset Input
        </button>
        {/* Added the Reset Result button */}
        <button className="reset-result" onClick={resetResult}>
          Reset Result
        </button>
      </form>
    </div>
  );
}

export default App;
