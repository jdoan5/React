import { useState, useRef } from "react";
import "./App.css";

function App() {
  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const [result, setResult] = useState(0);

  function plus(e) {
    e.preventDefault();
    const inputVal = inputRef.current.value;
    const newResult = result + Number(inputVal);
    setResult(newResult);
  }

  function minus(e) {
    e.preventDefault();
    const inputVal = inputRef.current.value;
    const newResult = result - Number(inputVal);
    setResult(newResult);
  }

  function times(e) {
    e.preventDefault();
    const inputVal = inputRef.current.value;
    const newResult = result * Number(inputVal);
    setResult(newResult);
  }

  function divide(e) {
    e.preventDefault();
    const inputVal = Number(inputRef.current.value);
    if (inputVal === 0) {
      alert("Cannot divide by zero");
    } else {
      const newResult = result / inputVal;
      setResult(newResult);
    }
  }

  function resetInput(e) {
    e.preventDefault();
    inputRef.current.value = "";
  }

  function resetResult(e) {
    e.preventDefault();
    setResult(0);
  }

  return (
    <div className="App">
      <div>
        <h1>Simplest Working Calculator</h1>
      </div>
      <form>
        <h3 ref={resultRef}>{result}</h3>
        <input
          ref={inputRef}
          pattern="[0-9]"
          type="number"
          placeholder="Type a number"
        />
        <button onClick={plus}>Add</button>
        <button onClick={minus}>Subtract</button>
        <button onClick={times}>Multiply</button>
        <button onClick={divide}>Divide</button>
        <button className="reset-input" onClick={resetInput}>
          Reset Input
        </button>
        <button className="reset-result" onClick={resetResult}>
          Reset Result
        </button>
      </form>
    </div>
  );
}

export default App;
