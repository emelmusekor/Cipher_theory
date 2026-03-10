const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const englishFrequencies = {
  A: 8.167, B: 1.492, C: 2.782, D: 4.253, E: 12.702, F: 2.228, G: 2.015,
  H: 6.094, I: 6.966, J: 0.153, K: 0.772, L: 4.025, M: 2.406, N: 6.749,
  O: 7.507, P: 1.929, Q: 0.095, R: 5.987, S: 6.327, T: 9.056, U: 2.758,
  V: 0.978, W: 2.36, X: 0.15, Y: 1.974, Z: 0.074,
};

const rotorCatalog = {
  I: { wiring: "EKMFLGDQVZNTOWYHXUSPAIBRCJ", notch: "Q" },
  II: { wiring: "AJDKSIRUXBLHWTMCQGZNPYFVOE", notch: "E" },
  III: { wiring: "BDFHJLCPRTXVZNYEIWGAKMUSQO", notch: "V" },
  IV: { wiring: "ESOVPZJAYQUIRHXLNFTGKDCMWB", notch: "J" },
  V: { wiring: "VZBRGITYUPSDNHLXAWMJQOFECK", notch: "Z" },
};

const reflectorB = "YRUHQSLDPXNGOKMIEBFZCWVJAT";

const tmPresets = {
  selfMapCheck: {
    name: "자기 자신 금지 검사",
    description: "왼쪽 글자와 오른쪽 글자가 같으면 !를 남겨 모순을 표시합니다.",
    tape: "A#A",
    blank: "_",
    start: "readFirst",
    accept: "done",
    transitions: {
      readFirst: {
        "A": { write: "A", move: "R", next: "rememberA" },
        "B": { write: "B", move: "R", next: "rememberB" },
      },
      rememberA: {
        "#": { write: "#", move: "R", next: "compareA" },
      },
      rememberB: {
        "#": { write: "#", move: "R", next: "compareB" },
      },
      compareA: {
        "A": { write: "!", move: "N", next: "done" },
        "B": { write: "B", move: "N", next: "done" },
      },
      compareB: {
        "A": { write: "A", move: "N", next: "done" },
        "B": { write: "!", move: "N", next: "done" },
      },
    },
  },
  unaryIncrement: {
    name: "단항 +1",
    description: "1의 개수 뒤에 1을 하나 더 붙입니다.",
    tape: "111",
    blank: "_",
    start: "scan",
    accept: "halt",
    transitions: {
      scan: {
        "1": { write: "1", move: "R", next: "scan" },
        _: { write: "1", move: "N", next: "halt" },
      },
    },
  },
  binaryIncrement: {
    name: "이진수 +1",
    description: "오른쪽 끝에서 올림을 전파합니다.",
    tape: "1011",
    blank: "_",
    start: "scan",
    accept: "halt",
    transitions: {
      scan: {
        "0": { write: "0", move: "R", next: "scan" },
        "1": { write: "1", move: "R", next: "scan" },
        _: { write: "_", move: "L", next: "add" },
      },
      add: {
        "1": { write: "0", move: "L", next: "add" },
        "0": { write: "1", move: "N", next: "halt" },
        _: { write: "1", move: "N", next: "halt" },
      },
    },
  },
  eraseToBlank: {
    name: "모두 지우기",
    description: "읽은 글자를 모두 공백으로 바꿉니다.",
    tape: "110101",
    blank: "_",
    start: "wipe",
    accept: "halt",
    transitions: {
      wipe: {
        "0": { write: "_", move: "R", next: "wipe" },
        "1": { write: "_", move: "R", next: "wipe" },
        _: { write: "_", move: "N", next: "halt" },
      },
    },
  },
};

const vnPresets = {
  sum: {
    code: `0: LOAD 8
1: ADD 9
2: STORE 10
3: OUT 10
4: HALT
8: DATA 7
9: DATA 5
10: DATA 0`,
  },
  countdown: {
    code: `0: OUT 8
1: SUB 9
2: STORE 8
3: JZ 6
4: JUMP 0
6: HALT
8: DATA 3
9: DATA 1`,
  },
};

const animationTimers = {};
let caesarMode = "decode";

const tmState = {
  presetKey: "selfMapCheck",
  tape: new Map(),
  head: 0,
  state: "readFirst",
  steps: 0,
  halted: false,
  log: "",
  initialTape: "A#A",
};

const vnState = {
  memory: new Map(),
  maxAddress: 15,
  pc: 0,
  acc: 0,
  ir: "-",
  phase: "fetch",
  halted: false,
  log: [],
  highlight: ["memory", "control"],
  fetchedCell: null,
  decodedCell: null,
  programText: "",
};

function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function charToIndex(char) {
  return alphabet.indexOf(char);
}

function indexToChar(index) {
  return alphabet[mod(index, 26)];
}

function safeUpper(text) {
  return (text || "").toUpperCase();
}

function onlyLetters(text) {
  return safeUpper(text).replace(/[^A-Z]/g, "");
}

function transformLetters(text, transform) {
  let letterIndex = 0;
  return safeUpper(text).split("").map((char) => {
    if (!/[A-Z]/.test(char)) {
      return char;
    }
    const next = transform(char, letterIndex);
    letterIndex += 1;
    return next;
  }).join("");
}

function resolveTarget(target) {
  return typeof target === "string" ? document.querySelector(target) : target;
}

function setText(target, text) {
  const element = resolveTarget(target);
  if (element) {
    element.textContent = text;
  }
}

function stopAnimation(name) {
  if (animationTimers[name]) {
    clearInterval(animationTimers[name]);
    delete animationTimers[name];
  }
}

function runAnimationLoop(name, frames, renderFrame, interval = 720) {
  stopAnimation(name);
  if (!frames.length) {
    return;
  }
  let index = 0;
  renderFrame(frames[0], 0);
  if (frames.length === 1) {
    return;
  }
  animationTimers[name] = setInterval(() => {
    index = (index + 1) % frames.length;
    renderFrame(frames[index], index);
  }, interval);
}

function truncateArray(items, max = 18) {
  return items.slice(0, max);
}

function renderCellStrip(target, items, activeIndex = -1, doneIndex = -1) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  items.forEach((item, index) => {
    const data = typeof item === "string" ? { char: item } : item;
    const cell = document.createElement("div");
    const char = data.char ?? "";
    const classes = ["cell"];
    if (!char || char === " ") {
      classes.push("empty");
    }
    if (data.filled || (index <= doneIndex && char && char !== " ")) {
      classes.push("done");
    }
    if (data.active || index === activeIndex) {
      classes.push("active");
    }
    cell.className = classes.join(" ");
    cell.textContent = char || "·";
    element.appendChild(cell);
  });
}

function renderBuildOutput(target, chars, activeIndex) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  chars.forEach((char, index) => {
    const cell = document.createElement("div");
    const classes = ["build-char"];
    if (index < activeIndex) {
      classes.push("done");
    }
    if (index === activeIndex) {
      classes.push("active");
    }
    if (index > activeIndex) {
      classes.push("pending");
    }
    cell.className = classes.join(" ");
    cell.textContent = index <= activeIndex ? char : "·";
    element.appendChild(cell);
  });
}

function renderPairStream(target, pairs, activeIndex = -1) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  pairs.forEach((pair, index) => {
    const card = document.createElement("div");
    card.className = `pair-card ${index === activeIndex ? "active" : ""}`.trim();
    card.innerHTML = `
      <small>${pair.label || `#${index + 1}`}</small>
      <span>${pair.input}</span>
      <span class="arrow">${pair.arrow || "→"}</span>
      <span>${pair.output}</span>
    `;
    element.appendChild(card);
  });
}

function renderAlphabetRail(target, letters, activeIndex = -1) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  letters.forEach((letter, index) => {
    const cell = document.createElement("div");
    cell.className = `alphabet-cell ${index === activeIndex ? "active" : ""}`.trim();
    cell.textContent = letter;
    element.appendChild(cell);
  });
}

function renderFrequencyChart(target, text) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  letterPercentages(text).forEach(({ char, count, ratio }) => {
    const row = document.createElement("div");
    row.className = "freq-row";
    const label = document.createElement("span");
    label.textContent = char;
    const bar = document.createElement("div");
    bar.className = "freq-bar";
    const fill = document.createElement("div");
    fill.className = "freq-fill";
    fill.style.width = `${Math.max(ratio, 2)}%`;
    bar.appendChild(fill);
    const value = document.createElement("span");
    value.textContent = `${count} (${ratio.toFixed(1)}%)`;
    row.append(label, bar, value);
    element.appendChild(row);
  });
}

function renderRanking(target, items) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "rank-item";
    row.innerHTML = `
      <span class="score-chip">#${index + 1}</span>
      <span class="mono-output">${item.plaintext}</span>
      <span class="score-chip">shift ${item.shift}</span>
    `;
    element.appendChild(row);
  });
}

function renderTraceTable(target, headers, rows) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  const template = `repeat(${headers.length}, minmax(0, 1fr))`;
  const header = document.createElement("div");
  header.className = "trace-header";
  header.style.gridTemplateColumns = template;
  headers.forEach((text) => {
    const span = document.createElement("span");
    span.textContent = text;
    header.appendChild(span);
  });
  element.appendChild(header);
  rows.forEach((cells) => {
    const row = document.createElement("div");
    row.className = "trace-row";
    row.style.gridTemplateColumns = template;
    cells.forEach((cell) => {
      const span = document.createElement("span");
      span.textContent = cell;
      row.appendChild(span);
    });
    element.appendChild(row);
  });
}

function createGrid(columns, characters) {
  const rows = Math.ceil(characters.length / columns);
  const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ""));
  let pointer = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (pointer < characters.length) {
        grid[row][column] = characters[pointer];
        pointer += 1;
      }
    }
  }
  return grid;
}

function rowSequence(grid) {
  const sequence = [];
  for (let row = 0; row < grid.length; row += 1) {
    for (let column = 0; column < grid[row].length; column += 1) {
      if (grid[row][column]) {
        sequence.push({ row, column, char: grid[row][column] });
      }
    }
  }
  return sequence;
}

function columnSequence(grid) {
  const sequence = [];
  const columns = grid[0]?.length || 0;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < grid.length; row += 1) {
      if (grid[row][column]) {
        sequence.push({ row, column, char: grid[row][column] });
      }
    }
  }
  return sequence;
}

function scytaleEncode(message, columns) {
  const clean = onlyLetters(message);
  const grid = createGrid(columns, clean);
  const cipher = columnSequence(grid).map((cell) => cell.char).join("");
  return { clean, cipher, grid };
}

function scytaleDecode(cipherText, columns) {
  const clean = onlyLetters(cipherText);
  const rows = Math.ceil(clean.length / columns);
  const grid = Array.from({ length: rows }, () => Array.from({ length: columns }, () => ""));
  const remainder = clean.length % columns;
  const columnLengths = Array.from({ length: columns }, (_, column) => {
    if (remainder === 0) {
      return rows;
    }
    return column < remainder ? rows : rows - 1;
  });
  let pointer = 0;
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < columnLengths[column]; row += 1) {
      grid[row][column] = clean[pointer];
      pointer += 1;
    }
  }
  return { clean, plain: rowSequence(grid).map((cell) => cell.char).join(""), grid };
}

function renderScytaleGrid(grid, target, activeCell = null) {
  const element = resolveTarget(target);
  element.innerHTML = "";
  if (!grid.length) {
    return;
  }
  const columns = grid[0].length;
  grid.forEach((rowData, rowIndex) => {
    const row = document.createElement("div");
    row.className = "letter-row";
    row.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    rowData.forEach((cellValue, columnIndex) => {
      const cell = document.createElement("div");
      const isActive = activeCell && activeCell.row === rowIndex && activeCell.column === columnIndex;
      cell.className = `letter-cell ${cellValue ? "" : "empty"} ${isActive ? "active" : ""}`.trim();
      cell.textContent = cellValue || "·";
      row.appendChild(cell);
    });
    element.appendChild(row);
  });
}

function caesarShiftChar(char, shift) {
  const index = charToIndex(char);
  return index === -1 ? char : indexToChar(index + shift);
}

function caesarTransform(text, shift) {
  return transformLetters(text, (char) => caesarShiftChar(char, shift));
}

function letterCounts(text) {
  const counts = Object.fromEntries(alphabet.split("").map((char) => [char, 0]));
  onlyLetters(text).split("").forEach((char) => {
    counts[char] += 1;
  });
  return counts;
}

function letterPercentages(text) {
  const counts = letterCounts(text);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  return alphabet.split("").map((char) => ({
    char,
    count: counts[char],
    ratio: (counts[char] / total) * 100,
  }));
}

function heuristicCaesar(text) {
  const clean = onlyLetters(text);
  if (!clean) {
    return null;
  }
  const counts = letterCounts(clean);
  const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const guessedShift = mod(charToIndex(mostCommon) - charToIndex("E"), 26);
  return {
    mostCommon,
    guessedShift,
    plaintext: caesarTransform(clean, -guessedShift),
  };
}

function chiSquare(text) {
  const counts = letterCounts(text);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0) || 1;
  let score = 0;
  for (const char of alphabet) {
    const expected = (englishFrequencies[char] / 100) * total;
    const observed = counts[char];
    score += ((observed - expected) ** 2) / (expected || 1);
  }
  return score;
}

function rankCaesarCandidates(text) {
  const clean = onlyLetters(text);
  if (!clean) {
    return [];
  }
  return Array.from({ length: 26 }, (_, shift) => {
    const plaintext = caesarTransform(clean, -shift);
    return { shift, plaintext, score: chiSquare(plaintext) };
  }).sort((a, b) => a.score - b.score);
}

function vigenereTransform(text, keyword, direction) {
  const cleanKey = onlyLetters(keyword);
  if (!cleanKey) {
    return { output: "", keyStream: "", pairs: [] };
  }
  let keyPointer = 0;
  const keyStreamChars = [];
  const pairs = [];
  const output = safeUpper(text).split("").map((char) => {
    if (!/[A-Z]/.test(char)) {
      keyStreamChars.push(char === " " ? " " : "·");
      return char;
    }
    const keyChar = cleanKey[keyPointer % cleanKey.length];
    const shift = charToIndex(keyChar) * direction;
    const outputChar = caesarShiftChar(char, shift);
    keyStreamChars.push(keyChar);
    pairs.push({ input: char, key: keyChar, output: outputChar, shift: charToIndex(keyChar) });
    keyPointer += 1;
    return outputChar;
  }).join("");
  return { output, keyStream: keyStreamChars.join(""), pairs };
}
function buildRotor(name, positionChar) {
  const config = rotorCatalog[name];
  const forward = config.wiring.split("").map(charToIndex);
  const backward = Array.from({ length: 26 }, () => 0);
  forward.forEach((value, index) => {
    backward[value] = index;
  });
  return {
    name,
    position: charToIndex(positionChar),
    notch: charToIndex(config.notch),
    forward,
    backward,
  };
}

function parsePlugboard(text) {
  const mapping = Array.from({ length: 26 }, (_, index) => index);
  const normalized = safeUpper(text).trim();
  if (!normalized) {
    return { mapping, error: "" };
  }
  const seen = new Set();
  const pairs = normalized.split(/\s+/).filter(Boolean);
  for (const pair of pairs) {
    if (!/^[A-Z]{2}$/.test(pair) || pair[0] === pair[1]) {
      return { mapping, error: "플러그보드는 서로 다른 두 글자 쌍으로 입력해 주세요. 예: AB CD" };
    }
    const [left, right] = pair.split("");
    if (seen.has(left) || seen.has(right)) {
      return { mapping, error: "플러그보드에 한 글자를 여러 번 사용할 수 없습니다." };
    }
    seen.add(left);
    seen.add(right);
    const leftIndex = charToIndex(left);
    const rightIndex = charToIndex(right);
    mapping[leftIndex] = rightIndex;
    mapping[rightIndex] = leftIndex;
  }
  return { mapping, error: "" };
}

function stepEnigmaRotors(rotors) {
  const [left, middle, right] = rotors;
  const rightAtNotch = right.position === right.notch;
  const middleAtNotch = middle.position === middle.notch;

  if (middleAtNotch) {
    left.position = mod(left.position + 1, 26);
    middle.position = mod(middle.position + 1, 26);
  } else if (rightAtNotch) {
    middle.position = mod(middle.position + 1, 26);
  }

  right.position = mod(right.position + 1, 26);
}

function rotorForward(index, rotor) {
  const shifted = mod(index + rotor.position, 26);
  const wired = rotor.forward[shifted];
  return mod(wired - rotor.position, 26);
}

function rotorBackward(index, rotor) {
  const shifted = mod(index + rotor.position, 26);
  const wired = rotor.backward[shifted];
  return mod(wired - rotor.position, 26);
}

function validateRotorOrder(order) {
  return new Set(order).size === order.length;
}

function createEnigmaMachine(order, positions, plugboardText) {
  if (!validateRotorOrder(order)) {
    return { error: "세 로터는 서로 달라야 합니다." };
  }
  const plugboard = parsePlugboard(plugboardText || "");
  if (plugboard.error) {
    return { error: plugboard.error };
  }
  return {
    error: "",
    machine: {
      rotors: order.map((name, index) => buildRotor(name, /[A-Z]/.test(positions[index]) ? positions[index] : "A")),
      plugboard: plugboard.mapping,
    },
  };
}

function enigmaLetter(char, machine) {
  if (!/[A-Z]/.test(char)) {
    const window = machine.rotors.map((rotor) => indexToChar(rotor.position)).join("");
    return { output: char, before: window, after: window, path: null };
  }

  const before = machine.rotors.map((rotor) => indexToChar(rotor.position)).join("");
  stepEnigmaRotors(machine.rotors);
  const after = machine.rotors.map((rotor) => indexToChar(rotor.position)).join("");

  let index = charToIndex(char);
  const path = { input: char };

  index = machine.plugboard[index];
  path.plug = indexToChar(index);

  index = rotorForward(index, machine.rotors[2]);
  path.right = indexToChar(index);

  index = rotorForward(index, machine.rotors[1]);
  path.middle = indexToChar(index);

  index = rotorForward(index, machine.rotors[0]);
  path.left = indexToChar(index);

  index = charToIndex(reflectorB[index]);
  path.reflector = indexToChar(index);

  index = rotorBackward(index, machine.rotors[0]);
  index = rotorBackward(index, machine.rotors[1]);
  index = rotorBackward(index, machine.rotors[2]);
  path.back = indexToChar(index);

  index = machine.plugboard[index];
  path.output = indexToChar(index);

  return { output: path.output, before, after, path };
}

function runEnigma(text, settings) {
  const built = createEnigmaMachine(settings.order, settings.positions, settings.plugboard);
  if (built.error) {
    return { error: built.error, output: "", trace: [] };
  }
  const trace = [];
  const output = safeUpper(text).split("").map((char) => {
    const result = enigmaLetter(char, built.machine);
    if (/[A-Z]/.test(char) && trace.length < 12) {
      trace.push({
        step: trace.length + 1,
        input: char,
        before: result.before,
        after: result.after,
        output: result.output,
        path: result.path,
      });
    }
    return result.output;
  }).join("");
  return {
    error: "",
    output,
    trace,
    finalWindow: built.machine.rotors.map((rotor) => indexToChar(rotor.position)),
  };
}

function indexToWindow(index) {
  const left = Math.floor(index / 676);
  const middle = Math.floor((index % 676) / 26);
  const right = index % 26;
  return `${indexToChar(left)}${indexToChar(middle)}${indexToChar(right)}`;
}

function decodeSegmentWithWindow(segment, order, window) {
  return runEnigma(segment, {
    order,
    positions: window.split(""),
    plugboard: "",
  }).output;
}

function searchCrib(ciphertext, crib, order) {
  const cleanCipher = onlyLetters(ciphertext);
  const cleanCrib = onlyLetters(crib);
  if (!cleanCipher || !cleanCrib || cleanCrib.length > cleanCipher.length) {
    return { cleanCipher, cleanCrib, alignments: [], totalOffsets: 0, truncated: false };
  }

  const totalOffsets = cleanCipher.length - cleanCrib.length + 1;
  const maxChecks = 2500000;
  const maxOffsets = Math.max(1, Math.floor(maxChecks / (17576 * cleanCrib.length)));
  const offsetLimit = Math.min(totalOffsets, maxOffsets);
  const alignments = [];

  for (let offset = 0; offset < offsetLimit; offset += 1) {
    const segment = cleanCipher.slice(offset, offset + cleanCrib.length);
    const selfConflict = segment.split("").some((char, idx) => char === cleanCrib[idx]);
    if (selfConflict) {
      alignments.push({
        offset,
        segment,
        status: "impossible",
        note: "같은 글자 금지 규칙으로 즉시 탈락",
        candidates: [],
      });
      continue;
    }
    const candidates = [];
    for (let index = 0; index < 17576; index += 1) {
      const window = indexToWindow(index);
      if (decodeSegmentWithWindow(segment, order, window) === cleanCrib) {
        candidates.push(window);
        if (candidates.length >= 8) {
          break;
        }
      }
    }
    alignments.push({
      offset,
      segment,
      status: candidates.length ? "candidate" : "none",
      note: candidates.length ? `${candidates.length}개 이상의 후보 발견` : "후보 없음",
      candidates,
    });
  }

  return {
    cleanCipher,
    cleanCrib,
    alignments,
    totalOffsets,
    truncated: offsetLimit < totalOffsets,
  };
}

function tapeToMap(content) {
  const tape = new Map();
  safeUpper(content).split("").forEach((char, index) => {
    tape.set(index, char || currentTmPreset().blank);
  });
  return tape;
}

function currentTmPreset() {
  return tmPresets[tmState.presetKey];
}

function loadTmPreset(presetKey, tapeInput) {
  tmState.presetKey = presetKey;
  const preset = currentTmPreset();
  const preparedTape = tapeInput || preset.tape;
  tmState.initialTape = preparedTape;
  tmState.tape = tapeToMap(preparedTape);
  tmState.head = 0;
  tmState.state = preset.start;
  tmState.steps = 0;
  tmState.halted = false;
  tmState.log = `${preset.name}: ${preset.description}`;
}

function tmRead(index) {
  return tmState.tape.get(index) || currentTmPreset().blank;
}

function tmWrite(index, value) {
  tmState.tape.set(index, value);
}

function tmStep() {
  if (tmState.halted) {
    tmState.log = "머신이 이미 정지했습니다.";
    return;
  }
  const preset = currentTmPreset();
  const symbol = tmRead(tmState.head);
  const action = preset.transitions[tmState.state]?.[symbol];
  if (!action) {
    tmState.halted = true;
    tmState.log = `전이 없음: 상태 ${tmState.state}, 기호 ${symbol}`;
    return;
  }
  tmWrite(tmState.head, action.write);
  if (action.move === "L") {
    tmState.head -= 1;
  }
  if (action.move === "R") {
    tmState.head += 1;
  }
  tmState.state = action.next;
  tmState.steps += 1;
  tmState.halted = action.next === preset.accept;
  tmState.log = `읽기 ${symbol} -> 쓰기 ${action.write}, 이동 ${action.move}, 다음 상태 ${action.next}`;
}

function visibleTapeRange() {
  const indexes = [...tmState.tape.keys()];
  const min = Math.min(...indexes, tmState.head, 0) - 2;
  const max = Math.max(...indexes, tmState.head, 0) + 2;
  return { min, max };
}

function parseVnInstruction(raw, address) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  let match = trimmed.match(/^DATA\s+(-?\d+)$/i);
  if (match) {
    return { address, kind: "data", value: Number(match[1]), raw: trimmed };
  }
  if (/^OUTACC$/i.test(trimmed)) {
    return { address, kind: "instruction", opcode: "OUTACC", operand: null, raw: trimmed };
  }
  if (/^HALT$/i.test(trimmed)) {
    return { address, kind: "instruction", opcode: "HALT", operand: null, raw: trimmed };
  }
  match = trimmed.match(/^(LOAD|ADD|SUB|STORE|JUMP|JZ|OUT)\s+(-?\d+)$/i);
  if (match) {
    return {
      address,
      kind: "instruction",
      opcode: match[1].toUpperCase(),
      operand: Number(match[2]),
      raw: trimmed,
    };
  }
  throw new Error(`주소 ${address}의 명령을 해석할 수 없습니다: ${trimmed}`);
}

function compileVnProgram(text) {
  const memory = new Map();
  let maxAddress = 15;
  safeUpper(text).split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const match = trimmed.match(/^(\d+)\s*:\s*(.+)$/);
    if (!match) {
      throw new Error(`주소 표기 오류: ${trimmed}`);
    }
    const address = Number(match[1]);
    const cell = parseVnInstruction(match[2], address);
    memory.set(address, cell);
    maxAddress = Math.max(maxAddress, address);
  });
  return { memory, maxAddress };
}

function resetVnState(programText) {
  const compiled = compileVnProgram(programText);
  vnState.memory = compiled.memory;
  vnState.maxAddress = compiled.maxAddress;
  vnState.pc = 0;
  vnState.acc = 0;
  vnState.ir = "-";
  vnState.phase = "fetch";
  vnState.halted = false;
  vnState.log = ["프로그램 적재 완료"];
  vnState.highlight = ["memory", "control"];
  vnState.fetchedCell = null;
  vnState.decodedCell = null;
  vnState.programText = programText;
}
function dataAt(address) {
  const cell = vnState.memory.get(address);
  if (!cell) {
    throw new Error(`주소 ${address}가 비어 있습니다.`);
  }
  if (cell.kind !== "data") {
    throw new Error(`주소 ${address}는 데이터가 아니라 명령입니다.`);
  }
  return cell.value;
}

function writeData(address, value) {
  vnState.memory.set(address, {
    address,
    kind: "data",
    value,
    raw: `DATA ${value}`,
  });
  vnState.maxAddress = Math.max(vnState.maxAddress, address);
}

function pushVnLog(message) {
  vnState.log.unshift(message);
  vnState.log = vnState.log.slice(0, 8);
}

function vnNextPhase() {
  if (vnState.halted) {
    pushVnLog("컴퓨터가 이미 정지했습니다.");
    return;
  }

  if (vnState.phase === "fetch") {
    const cell = vnState.memory.get(vnState.pc);
    if (!cell) {
      vnState.halted = true;
      pushVnLog(`PC ${vnState.pc}에 명령이 없어 정지합니다.`);
      return;
    }
    vnState.fetchedCell = cell;
    vnState.ir = cell.raw;
    vnState.phase = "decode";
    vnState.highlight = ["memory", "control"];
    pushVnLog(`Fetch: 주소 ${vnState.pc}에서 ${cell.raw}`);
    return;
  }

  if (vnState.phase === "decode") {
    const cell = vnState.fetchedCell || vnState.memory.get(vnState.pc);
    if (!cell || cell.kind !== "instruction") {
      vnState.halted = true;
      pushVnLog("디코드 단계에서 명령이 아닌 셀을 만났습니다.");
      return;
    }
    vnState.decodedCell = cell;
    vnState.phase = "execute";
    vnState.highlight = ["control"];
    pushVnLog(`Decode: ${cell.opcode}${cell.operand !== null ? ` ${cell.operand}` : ""}`);
    return;
  }

  const instruction = vnState.decodedCell || vnState.memory.get(vnState.pc);
  if (!instruction || instruction.kind !== "instruction") {
    vnState.halted = true;
    pushVnLog("실행할 명령을 찾지 못했습니다.");
    return;
  }

  let nextPc = vnState.pc + 1;
  let highlight = ["alu"];
  try {
    switch (instruction.opcode) {
      case "LOAD":
        vnState.acc = dataAt(instruction.operand);
        highlight = ["memory", "alu"];
        pushVnLog(`Execute: ACC <- M[${instruction.operand}] = ${vnState.acc}`);
        break;
      case "ADD":
        vnState.acc += dataAt(instruction.operand);
        highlight = ["memory", "alu"];
        pushVnLog(`Execute: ACC += M[${instruction.operand}] -> ${vnState.acc}`);
        break;
      case "SUB":
        vnState.acc -= dataAt(instruction.operand);
        highlight = ["memory", "alu"];
        pushVnLog(`Execute: ACC -= M[${instruction.operand}] -> ${vnState.acc}`);
        break;
      case "STORE":
        writeData(instruction.operand, vnState.acc);
        highlight = ["memory", "alu"];
        pushVnLog(`Execute: M[${instruction.operand}] <- ${vnState.acc}`);
        break;
      case "JUMP":
        nextPc = instruction.operand;
        highlight = ["control"];
        pushVnLog(`Execute: PC <- ${instruction.operand}`);
        break;
      case "JZ":
        nextPc = vnState.acc === 0 ? instruction.operand : vnState.pc + 1;
        highlight = ["control"];
        pushVnLog(vnState.acc === 0 ? `Execute: ACC가 0이라 ${instruction.operand}로 점프` : "Execute: ACC가 0이 아니므로 다음 명령");
        break;
      case "OUT": {
        const outValue = dataAt(instruction.operand);
        highlight = ["memory", "output"];
        pushVnLog(`출력값: ${outValue}`);
        break;
      }
      case "OUTACC":
        highlight = ["output", "alu"];
        pushVnLog(`출력값: ${vnState.acc}`);
        break;
      case "HALT":
        vnState.halted = true;
        highlight = ["control"];
        pushVnLog("Execute: HALT");
        break;
      default:
        throw new Error(`지원하지 않는 opcode: ${instruction.opcode}`);
    }
  } catch (error) {
    vnState.halted = true;
    pushVnLog(error.message);
  }

  vnState.pc = vnState.halted ? vnState.pc : nextPc;
  vnState.phase = vnState.halted ? "halted" : "fetch";
  vnState.highlight = highlight;
}

function renderTm() {
  const preset = currentTmPreset();
  setText("#tm-state", tmState.state);
  setText("#tm-head", String(tmState.head));
  setText("#tm-steps", String(tmState.steps));
  setText("#tm-log", `${preset.description} | ${tmState.log}`);

  const tapeTarget = resolveTarget("#tm-tape");
  tapeTarget.innerHTML = "";
  const range = visibleTapeRange();
  for (let index = range.min; index <= range.max; index += 1) {
    const cell = document.createElement("div");
    cell.className = `tape-cell ${index === tmState.head ? "active" : ""}`.trim();
    cell.innerHTML = `
      <span class="tape-index">${index}</span>
      <span class="tape-symbol">${tmRead(index)}</span>
    `;
    tapeTarget.appendChild(cell);
  }

  const rows = [];
  Object.entries(preset.transitions).forEach(([state, transitions]) => {
    Object.entries(transitions).forEach(([symbol, action]) => {
      rows.push([state, symbol, action.write, action.move, action.next]);
    });
  });
  renderTraceTable("#tm-table", ["상태", "읽기", "쓰기", "이동", "다음"], rows);
  updateTmHardware();
}

function renderVn() {
  setText("#vn-pc", String(vnState.pc));
  setText("#vn-acc", String(vnState.acc));
  setText("#vn-ir", vnState.ir);
  setText("#vn-phase-name", vnState.phase);
  setText("#vn-output", vnState.log.join(" | "));

  document.querySelectorAll(".arch-box").forEach((box) => {
    box.classList.toggle("active", vnState.highlight.includes(box.dataset.unit));
  });

  const memoryTarget = resolveTarget("#vn-memory");
  memoryTarget.innerHTML = "";
  for (let address = 0; address <= vnState.maxAddress; address += 1) {
    const cell = document.createElement("div");
    const data = vnState.memory.get(address);
    cell.className = `memory-cell ${address === vnState.pc ? "active" : ""}`.trim();
    cell.innerHTML = `
      <span class="memory-address">${address}</span>
      <span>${data ? data.raw : "EMPTY"}</span>
    `;
    memoryTarget.appendChild(cell);
  }
  updateComputerHardware();
}

function renderBombeTrack(target, totalLength, text, offset) {
  const items = [];
  for (let index = 0; index < totalLength; index += 1) {
    const relative = index - offset;
    if (relative >= 0 && relative < text.length) {
      items.push({ char: text[relative], filled: true });
    } else {
      items.push({ char: "" });
    }
  }
  renderCellStrip(target, items);
}

function clearEnigmaPath() {
  ["input", "plug", "right", "middle", "left", "reflector", "back", "output"].forEach((key) => {
    setText(`#enigma-path-${key}`, "-");
  });
}
function animateScytale(sourceText, grid, outputText, mode) {
  const sourceChars = truncateArray((mode === "encode" ? sourceText : onlyLetters(sourceText)).split(""));
  const sequence = truncateArray((mode === "encode" ? columnSequence(grid) : rowSequence(grid)));
  setText("#scytale-source-label", mode === "encode" ? "표에 들어가는 글자" : "표에 채워진 암호문");
  setText("#scytale-build-label", mode === "encode" ? "세로로 읽으며 암호문 만들기" : "가로로 읽으며 평문 복원하기");
  renderCellStrip("#scytale-source-strip", sourceChars);
  if (!sequence.length) {
    renderBuildOutput("#scytale-build", [], -1);
    setText("#scytale-visual-caption", "영문자를 입력하면 시각화가 시작됩니다.");
    renderScytaleGrid(grid, "#scytale-grid");
    updateScytaleHardware(grid, null, mode);
    return;
  }
  const buildChars = truncateArray(sequence.map((cell) => cell.char));
  runAnimationLoop("scytale", sequence, (step, index) => {
    renderScytaleGrid(grid, "#scytale-grid", step);
    renderBuildOutput("#scytale-build", buildChars, index);
    updateScytaleHardware(grid, step, mode);
    setText(
      "#scytale-visual-caption",
      mode === "encode"
        ? `${index + 1}단계: ${step.row + 1}행 ${step.column + 1}열의 ${step.char}를 세로로 읽어 암호문 뒤에 붙입니다.`
        : `${index + 1}단계: ${step.row + 1}행 ${step.column + 1}열의 ${step.char}를 가로로 읽어 평문을 되찾습니다.`
    );
  });
}

function animateCaesar(input, effectiveShift, reasonText) {
  const pairs = truncateArray(onlyLetters(input).split("").map((char, index) => ({
    label: `${index + 1}`,
    input: char,
    output: caesarShiftChar(char, effectiveShift),
  })));
  if (!pairs.length) {
    renderAlphabetRail("#caesar-rail-plain", []);
    renderAlphabetRail("#caesar-rail-shifted", []);
    renderPairStream("#caesar-pairs", []);
    setText("#caesar-visual-caption", "영문자를 입력하면 알파벳 이동이 보입니다.");
    updateCaesarHardware(effectiveShift, input, caesarMode, null);
    return;
  }
  const topRail = alphabet.split("");
  const bottomRail = alphabet.split("").map((char) => caesarShiftChar(char, effectiveShift));
  runAnimationLoop("caesar", pairs, (pair, index) => {
    const activeColumn = charToIndex(pair.input);
    renderAlphabetRail("#caesar-rail-plain", topRail, activeColumn);
    renderAlphabetRail("#caesar-rail-shifted", bottomRail, activeColumn);
    renderPairStream("#caesar-pairs", pairs, index);
    updateCaesarHardware(effectiveShift, input, caesarMode, pair);
    const sign = effectiveShift >= 0 ? "+" : "";
    setText("#caesar-visual-caption", `${reasonText}: ${pair.input} -> ${pair.output} (shift ${sign}${effectiveShift})`);
  });
}

function animateVigenere(pairs, mode) {
  const frames = truncateArray(pairs);
  setText("#vigenere-input-label", mode === "encode" ? "입력 평문" : "입력 암호문");
  setText("#vigenere-output-label", mode === "encode" ? "출력 암호문" : "복원된 평문");
  if (!frames.length) {
    renderCellStrip("#vigenere-input-row", []);
    renderCellStrip("#vigenere-key-row", []);
    renderCellStrip("#vigenere-output-row", []);
    setText("#vigenere-visual-caption", "키워드와 영문 입력을 넣으면 반복 키가 움직입니다.");
    updateVigenereHardware(null, mode);
    return;
  }
  const inputChars = frames.map((pair) => pair.input);
  const keyChars = frames.map((pair) => pair.key);
  const outputChars = frames.map((pair) => pair.output);
  runAnimationLoop("vigenere", frames, (pair, index) => {
    renderCellStrip("#vigenere-input-row", inputChars, index, index - 1);
    renderCellStrip("#vigenere-key-row", keyChars, index, index - 1);
    renderCellStrip("#vigenere-output-row", outputChars, index, index - 1);
    updateVigenereHardware(pair, mode);
    const operator = mode === "encode" ? "+" : "-";
    setText("#vigenere-visual-caption", `${pair.input} ${operator} ${pair.key}(${pair.shift}) = ${pair.output}`);
  });
}

function renderEnigmaPath(frame) {
  if (!frame || !frame.path) {
    clearEnigmaPath();
    return;
  }
  setText("#enigma-path-input", frame.path.input);
  setText("#enigma-path-plug", frame.path.plug);
  setText("#enigma-path-right", frame.path.right);
  setText("#enigma-path-middle", frame.path.middle);
  setText("#enigma-path-left", frame.path.left);
  setText("#enigma-path-reflector", frame.path.reflector);
  setText("#enigma-path-back", frame.path.back);
  setText("#enigma-path-output", frame.path.output);
  setText("#enigma-window-left", frame.after[0]);
  setText("#enigma-window-middle", frame.after[1]);
  setText("#enigma-window-right", frame.after[2]);
}

function animateEnigma(trace, fallbackWindows, settings) {
  const frames = truncateArray(trace);
  if (!frames.length) {
    clearEnigmaPath();
    setText("#enigma-window-left", fallbackWindows[0] || "A");
    setText("#enigma-window-middle", fallbackWindows[1] || "A");
    setText("#enigma-window-right", fallbackWindows[2] || "A");
    renderPairStream("#enigma-letter-film", []);
    updateEnigmaHardware(null, settings, fallbackWindows);
    setText("#enigma-visual-caption", "영문자를 입력하면 한 글자가 로터를 통과하는 경로가 보입니다.");
    return;
  }
  const pairs = frames.map((frame, index) => ({
    label: `${index + 1}`,
    input: frame.input,
    output: frame.output,
  }));
  runAnimationLoop("enigma", frames, (frame, index) => {
    renderPairStream("#enigma-letter-film", pairs, index);
    renderEnigmaPath(frame);
    updateEnigmaHardware(frame, settings, fallbackWindows);
    setText("#enigma-visual-caption", `${frame.before}에서 ${frame.input}가 들어가 ${frame.output}로 나오고, 다음 창은 ${frame.after}가 됩니다.`);
  }, 860);
}

function animateBombe(result, order) {
  const frames = truncateArray(result.alignments, 8);
  if (!result.cleanCipher || !result.cleanCrib || !frames.length) {
    renderCellStrip("#bombe-cipher-track", []);
    renderCellStrip("#bombe-crib-track", []);
    updateBombeHardware(result, order, null);
    setText("#bombe-visual-caption", "암호문과 크립을 입력하면 정렬을 겹쳐 보는 과정이 보입니다.");
    return;
  }
  const visibleCipher = truncateArray(result.cleanCipher.split(""), 18);
  runAnimationLoop("bombe", frames, (frame) => {
    renderCellStrip("#bombe-cipher-track", visibleCipher);
    renderBombeTrack("#bombe-crib-track", visibleCipher.length, result.cleanCrib, frame.offset);
    updateBombeHardware(result, order, frame);
    const caption = frame.status === "impossible"
      ? `offset ${frame.offset}: ${frame.segment}와 ${result.cleanCrib}를 겹치면 자기 자신으로 가는 글자가 생겨 바로 탈락합니다.`
      : `offset ${frame.offset}: ${frame.segment}와 ${result.cleanCrib}를 겹쳐 보고 가능한 설정을 더 검사합니다.`;
    setText("#bombe-visual-caption", caption);
  }, 980);
}

function setInlineStyle(target, property, value) {
  const element = resolveTarget(target);
  if (element) {
    element.style.setProperty(property, value);
  }
}

function toggleElementClass(target, className, enabled) {
  const element = resolveTarget(target);
  if (element) {
    element.classList.toggle(className, Boolean(enabled));
  }
}

function updateScytaleHardware(grid, step, mode) {
  for (let index = 0; index < 4; index += 1) {
    const rowText = (grid[index] || []).join("") || "·";
    setText(`#scytale-band-${index + 1}`, rowText);
  }
  const totalColumns = Math.max(1, grid[0]?.length || 1);
  const columnRatio = (step?.column || 0) / Math.max(totalColumns - 1, 1);
  const rowIndex = Math.min(step?.row || 0, 3);
  setInlineStyle("#scytale-pointer", "left", `${18 + columnRatio * 60}%`);
  setInlineStyle("#scytale-pointer", "top", `${26 + rowIndex * 16}%`);
  setText(
    "#scytale-machine-caption",
    mode === "encode"
      ? `막대 둘레 ${totalColumns}칸에 띠를 감은 상태입니다. 세로로 읽기 시작하면 글자 순서가 바뀝니다.`
      : `같은 둘레의 막대에 다시 감으면 흐트러진 글자들이 원래 줄 순서로 돌아옵니다.`
  );
}

function updateCaesarHardware(effectiveShift, input, mode, pair) {
  const normalized = mod(effectiveShift, 26);
  const source = pair?.input || onlyLetters(input)[0] || "A";
  const output = pair?.output || caesarShiftChar(source, effectiveShift);
  setInlineStyle("#caesar-disk-inner", "transform", `translate(-50%, -50%) rotate(${(normalized / 26) * 360}deg)`);
  setText("#caesar-disk-shift", `${effectiveShift >= 0 ? "+" : ""}${effectiveShift}`);
  setText("#caesar-disk-window", output);
  setText(
    "#caesar-machine-caption",
    `${mode === "encode" ? "안쪽 원판을 앞으로 돌리면" : "원판을 거꾸로 맞추면"} ${source}가 창에서 ${output}(으)로 대응됩니다.`
  );
}

function updateVigenereHardware(pair, mode) {
  const current = pair || { input: "A", key: "A", output: "A", shift: 0 };
  setText("#vigenere-machine-input", current.input);
  setText("#vigenere-machine-key-display", current.key);
  setText("#vigenere-machine-output", current.output);
  setInlineStyle("#vigenere-wheel-input", "transform", `rotate(${charToIndex(current.input) * 6}deg)`);
  setInlineStyle("#vigenere-wheel-key", "transform", `rotate(${charToIndex(current.key) * 8}deg)`);
  setInlineStyle("#vigenere-wheel-output", "transform", `rotate(${charToIndex(current.output) * 6}deg)`);
  setText(
    "#vigenere-machine-caption",
    pair
      ? `${current.input} ${mode === "encode" ? "+" : "-"} ${current.key}(${current.shift}) = ${current.output}. 가운데 키 원판이 이 칸의 이동량을 만듭니다.`
      : "입력과 키를 넣으면 세 개의 원판이 각 위치의 변환을 보여 줍니다."
  );
}

function clearEnigmaHardware() {
  ["#enigma-hw-keyboard", "#enigma-hw-plug", "#enigma-hw-right", "#enigma-hw-middle", "#enigma-hw-left", "#enigma-hw-reflector", "#enigma-hw-lamp"].forEach((target) => {
    toggleElementClass(target, "active", false);
  });
}

function updateEnigmaHardware(frame, settings, fallbackWindows) {
  const windowText = frame?.after || (Array.isArray(fallbackWindows) ? fallbackWindows.join("") : fallbackWindows?.join ? fallbackWindows.join("") : "AAA");
  const windows = (windowText || "AAA").split("");
  setText("#enigma-hw-left-label", settings.order[0]);
  setText("#enigma-hw-middle-label", settings.order[1]);
  setText("#enigma-hw-right-label", settings.order[2]);
  setText("#enigma-hw-left-window", windows[0] || "A");
  setText("#enigma-hw-middle-window", windows[1] || "A");
  setText("#enigma-hw-right-window", windows[2] || "A");
  setText("#enigma-hw-input", frame?.input || onlyLetters(document.querySelector("#enigma-input").value)[0] || "A");
  setText("#enigma-hw-output", frame?.output || "-");
  clearEnigmaHardware();
  if (frame) {
    ["#enigma-hw-keyboard", "#enigma-hw-plug", "#enigma-hw-right", "#enigma-hw-middle", "#enigma-hw-left", "#enigma-hw-reflector", "#enigma-hw-lamp"].forEach((target) => {
      toggleElementClass(target, "active", true);
    });
  }
  setText(
    "#enigma-machine-caption",
    frame
      ? `${frame.input} 신호가 플러그보드와 세 로터를 지나 ${frame.output} 램프를 켭니다. 그 뒤 창 위치는 ${frame.after}가 됩니다.`
      : `로터 ${settings.order.join("-")}가 ${windows.join("")} 창 위치에서 다음 글자를 기다리고 있습니다.`
  );
}

function updateBombeHardware(result, order, focus) {
  setText("#bombe-drum-left-label", order?.[0] || "I");
  setText("#bombe-drum-middle-label", order?.[1] || "II");
  setText("#bombe-drum-right-label", order?.[2] || "III");
  const goodOn = focus ? focus.status === "candidate" : result.alignments?.some((item) => item.status === "candidate");
  const badOn = focus ? focus.status === "impossible" : result.alignments?.some((item) => item.status === "impossible");
  toggleElementClass("#bombe-lamp-good", "active", goodOn);
  toggleElementClass("#bombe-lamp-bad", "active", badOn);
  setText(
    "#bombe-machine-caption",
    focus
      ? focus.status === "impossible"
        ? `offset ${focus.offset}는 같은 글자 금지 규칙에 걸려 빨간 램프가 켜집니다.`
        : `offset ${focus.offset}는 더 검사할 가치가 있어 초록 램프가 켜집니다.`
      : "회전 드럼이 가능한 설정을 빠르게 훑고, 모순이 보이면 즉시 탈락시킵니다."
  );
}

function updateTmHardware() {
  const track = resolveTarget("#tm-machine-track");
  if (!track) {
    return;
  }
  track.innerHTML = "";
  for (let offset = -2; offset <= 2; offset += 1) {
    const index = tmState.head + offset;
    const cell = document.createElement("div");
    cell.className = `tm-machine-cell ${offset === 0 ? "active" : ""}`.trim();
    cell.innerHTML = `<small>${index}</small><span>${tmRead(index)}</span>`;
    track.appendChild(cell);
  }
  setText("#tm-machine-caption", `헤드는 ${tmState.head}칸에서 ${tmRead(tmState.head)}를 읽고, 상태 ${tmState.state}에 따라 다음 행동을 고릅니다.`);
}

function updateComputerHardware() {
  const lastLog = vnState.log.length ? vnState.log[vnState.log.length - 1] : "ready";
  setText("#computer-hw-input", vnState.phase === "fetch" ? "read" : "stdin");
  setText("#computer-hw-memory", `PC ${vnState.pc}`);
  setText("#computer-hw-control", String(vnState.phase).toUpperCase());
  setText("#computer-hw-alu", `ACC ${vnState.acc}`);
  setText("#computer-hw-output", String(lastLog).slice(0, 18));
  toggleElementClass("#computer-chip-input", "active", vnState.highlight.includes("input"));
  toggleElementClass("#computer-chip-memory", "active", vnState.highlight.includes("memory"));
  toggleElementClass("#computer-chip-control", "active", vnState.highlight.includes("control"));
  toggleElementClass("#computer-chip-alu", "active", vnState.highlight.includes("alu"));
  toggleElementClass("#computer-chip-output", "active", vnState.highlight.includes("output"));
  setText("#computer-machine-caption", `현재 ${vnState.phase} 단계입니다. PC ${vnState.pc}, ACC ${vnState.acc}, IR ${vnState.ir}.`);
}

function updateScytale(mode) {
  const input = document.querySelector("#scytale-input").value;
  const columns = Math.max(2, Number(document.querySelector("#scytale-columns").value) || 5);
  const result = mode === "encode" ? scytaleEncode(input, columns) : scytaleDecode(input, columns);
  setText("#scytale-output", (mode === "encode" ? result.cipher : result.plain) || "입력된 영문자가 없습니다.");
  setText("#scytale-meta", `${result.clean.length}글자 / ${columns}열`);
  renderScytaleGrid(result.grid, "#scytale-grid");
  animateScytale(result.clean, result.grid, mode === "encode" ? result.cipher : result.plain, mode);
}

function updateCaesarTransform(mode) {
  caesarMode = mode;
  const input = document.querySelector("#caesar-input").value;
  const shift = Number(document.querySelector("#caesar-shift").value);
  const effectiveShift = mode === "encode" ? shift : -shift;
  const result = caesarTransform(input, effectiveShift);
  setText("#caesar-output", result || "입력된 영문자가 없습니다.");
  animateCaesar(input, effectiveShift, mode === "encode" ? "암호화 중" : "복호화 중");
}

function updateCaesarAnalysis() {
  const input = document.querySelector("#caesar-input").value;
  const heuristic = heuristicCaesar(input);
  const ranked = rankCaesarCandidates(input);
  if (!onlyLetters(input)) {
    setText("#caesar-heuristic", "영문자를 입력하면 휴리스틱 추정을 보여줍니다.");
    setText("#caesar-math", "영문자를 입력하면 통계 점수를 계산합니다.");
    resolveTarget("#caesar-ranking").innerHTML = "";
    resolveTarget("#caesar-frequency").innerHTML = "";
    return;
  }

  setText(
    "#caesar-heuristic",
    heuristic
      ? `가장 많이 나온 글자 ${heuristic.mostCommon}를 E로 보면 shift ${heuristic.guessedShift}, 추정 평문은 ${heuristic.plaintext}입니다.`
      : "추정할 수 없습니다."
  );

  if (ranked.length) {
    setText("#caesar-math", `카이제곱 점수가 가장 낮은 해는 shift ${ranked[0].shift}, 평문 ${ranked[0].plaintext}입니다.`);
    renderRanking("#caesar-ranking", ranked.slice(0, 5));
  } else {
    setText("#caesar-math", "후보를 계산할 수 없습니다.");
    resolveTarget("#caesar-ranking").innerHTML = "";
  }

  renderFrequencyChart("#caesar-frequency", input);
}

function updateVigenere(mode) {
  const input = document.querySelector("#vigenere-input").value;
  const key = document.querySelector("#vigenere-key").value;
  const result = vigenereTransform(input, key, mode === "encode" ? 1 : -1);
  setText("#vigenere-output", result.output || "키워드를 입력해 주세요.");
  setText("#vigenere-keystream", result.keyStream || "키워드가 없으면 스트림이 생성되지 않습니다.");
  animateVigenere(result.pairs, mode);
}

function getEnigmaSettings() {
  return {
    order: [
      document.querySelector("#enigma-left-rotor").value,
      document.querySelector("#enigma-middle-rotor").value,
      document.querySelector("#enigma-right-rotor").value,
    ],
    positions: [
      safeUpper(document.querySelector("#enigma-left-position").value)[0] || "A",
      safeUpper(document.querySelector("#enigma-middle-position").value)[0] || "A",
      safeUpper(document.querySelector("#enigma-right-position").value)[0] || "A",
    ],
    plugboard: document.querySelector("#enigma-plugboard").value,
  };
}

function updateEnigma() {
  const settings = getEnigmaSettings();
  const input = document.querySelector("#enigma-input").value;
  const result = runEnigma(input, settings);
  setText("#enigma-output", result.error || result.output || "입력된 영문자가 없습니다.");
  setText("#enigma-message", result.error ? result.error : "같은 설정으로 결과 문자열을 다시 넣으면 원문으로 되돌릴 수 있습니다.");
  if (result.error) {
    animateEnigma([], settings.positions, settings);
    renderTraceTable("#enigma-trace", ["#", "입력/출력", "창 위치", "출력"], []);
    return;
  }
  const rows = result.trace.map((row) => [String(row.step), `${row.input} -> ${row.output}`, `${row.before} / ${row.after}`, row.output]);
  renderTraceTable("#enigma-trace", ["#", "입력/출력", "창 위치(전/후)", "결과"], rows);
  animateEnigma(result.trace, result.finalWindow || settings.positions, settings);
}

function updateBombe() {
  const order = [
    document.querySelector("#bombe-left-rotor").value,
    document.querySelector("#bombe-middle-rotor").value,
    document.querySelector("#bombe-right-rotor").value,
  ];
  const alignTarget = resolveTarget("#bombe-alignments");
  const candidateTarget = resolveTarget("#bombe-candidates");
  if (!validateRotorOrder(order)) {
    setText("#bombe-summary", "세 로터는 서로 달라야 합니다.");
    setText("#bombe-note", "로터 순서를 다시 선택해 주세요.");
    alignTarget.innerHTML = "";
    candidateTarget.innerHTML = "";
    animateBombe({ cleanCipher: "", cleanCrib: "", alignments: [] }, order);
    return;
  }

  const result = searchCrib(document.querySelector("#bombe-ciphertext").value, document.querySelector("#bombe-crib").value, order);
  const possible = result.alignments.filter((item) => item.status === "candidate");
  const impossible = result.alignments.filter((item) => item.status === "impossible");
  setText(
    "#bombe-summary",
    result.cleanCrib
      ? `${result.alignments.length}개 정렬을 검사했고, ${possible.length}개 정렬에서 후보가 나왔습니다.`
      : "암호문과 크립을 모두 영문으로 입력해 주세요."
  );
  setText(
    "#bombe-note",
    result.truncated
      ? "검색량이 커서 앞부분 정렬만 먼저 검사했습니다. 더 짧은 암호문이나 크립으로 다시 시도해 보세요."
      : `${impossible.length}개 정렬은 같은 글자 금지 규칙만으로 즉시 탈락했습니다.`
  );

  alignTarget.innerHTML = "";
  candidateTarget.innerHTML = "";
  result.alignments.forEach((alignment) => {
    const row = document.createElement("div");
    row.className = "rank-item";
    row.innerHTML = `
      <span class="offset-chip">${alignment.offset}</span>
      <span class="mono-output">${alignment.segment || "-"}</span>
      <span class="status-chip ${alignment.status === "impossible" ? "bad" : alignment.status === "candidate" ? "good" : ""}">${alignment.note}</span>
    `;
    alignTarget.appendChild(row);
  });

  possible.forEach((alignment) => {
    alignment.candidates.forEach((window) => {
      const card = document.createElement("div");
      card.className = "candidate-item";
      card.innerHTML = `
        <span class="offset-chip">offset ${alignment.offset}</span>
        <span class="score-chip">${window}</span>
        <span class="mono-output">segment ${alignment.segment} -> crib ${result.cleanCrib}</span>
      `;
      candidateTarget.appendChild(card);
    });
  });

  if (!possible.length && result.cleanCrib) {
    const card = document.createElement("div");
    card.className = "candidate-item";
    card.innerHTML = '<span class="score-chip">0</span><span class="mono-output">후보 창 위치가 발견되지 않았습니다.</span><span></span>';
    candidateTarget.appendChild(card);
  }

  animateBombe(result, order);
}

function attachEvents() {
  document.querySelector("#scytale-encode").addEventListener("click", () => updateScytale("encode"));
  document.querySelector("#scytale-decode").addEventListener("click", () => updateScytale("decode"));
  document.querySelector("#scytale-example").addEventListener("click", () => {
    document.querySelector("#scytale-input").value = "HISTORYOFCOMPUTINGSTARTSWITHCIPHERS";
    document.querySelector("#scytale-columns").value = "6";
    updateScytale("encode");
  });

  document.querySelector("#caesar-input").addEventListener("input", () => {
    updateCaesarTransform(caesarMode);
    updateCaesarAnalysis();
  });
  document.querySelector("#caesar-shift").addEventListener("input", (event) => {
    setText("#caesar-shift-value", event.target.value);
    updateCaesarTransform(caesarMode);
    updateCaesarAnalysis();
  });
  document.querySelector("#caesar-encode").addEventListener("click", () => {
    updateCaesarTransform("encode");
    updateCaesarAnalysis();
  });
  document.querySelector("#caesar-decode").addEventListener("click", () => {
    updateCaesarTransform("decode");
    updateCaesarAnalysis();
  });
  document.querySelector("#caesar-analyze").addEventListener("click", updateCaesarAnalysis);
  document.querySelector("#caesar-example").addEventListener("click", () => {
    document.querySelector("#caesar-input").value = "WKLV LV D FLSKHU IRU FODVVURRP GLVFXVVLRQ";
    document.querySelector("#caesar-shift").value = "3";
    setText("#caesar-shift-value", "3");
    updateCaesarTransform("decode");
    updateCaesarAnalysis();
  });

  document.querySelector("#vigenere-encode").addEventListener("click", () => updateVigenere("encode"));
  document.querySelector("#vigenere-decode").addEventListener("click", () => updateVigenere("decode"));
  document.querySelector("#vigenere-example").addEventListener("click", () => {
    document.querySelector("#vigenere-input").value = "SECRETSBECAMEINDUSTRIALSCALE";
    document.querySelector("#vigenere-key").value = "ALAN";
    updateVigenere("encode");
  });

  document.querySelector("#enigma-run").addEventListener("click", updateEnigma);
  document.querySelector("#enigma-example").addEventListener("click", () => {
    document.querySelector("#enigma-left-rotor").value = "I";
    document.querySelector("#enigma-middle-rotor").value = "II";
    document.querySelector("#enigma-right-rotor").value = "III";
    document.querySelector("#enigma-left-position").value = "A";
    document.querySelector("#enigma-middle-position").value = "A";
    document.querySelector("#enigma-right-position").value = "A";
    document.querySelector("#enigma-plugboard").value = "";
    document.querySelector("#enigma-input").value = "HELLO WORLD";
    updateEnigma();
  });
  document.querySelector("#enigma-reset").addEventListener("click", () => {
    document.querySelector("#enigma-left-position").value = "A";
    document.querySelector("#enigma-middle-position").value = "A";
    document.querySelector("#enigma-right-position").value = "A";
    updateEnigma();
  });

  document.querySelector("#bombe-run").addEventListener("click", updateBombe);
  document.querySelector("#bombe-example").addEventListener("click", () => {
    document.querySelector("#bombe-left-rotor").value = "I";
    document.querySelector("#bombe-middle-rotor").value = "II";
    document.querySelector("#bombe-right-rotor").value = "III";
    document.querySelector("#bombe-ciphertext").value = "ILBDAAMTAZ";
    document.querySelector("#bombe-crib").value = "WORLD";
    updateBombe();
  });

  document.querySelector("#tm-load").addEventListener("click", () => {
    loadTmPreset(document.querySelector("#tm-preset").value, document.querySelector("#tm-input").value);
    renderTm();
  });
  document.querySelector("#tm-step").addEventListener("click", () => {
    tmStep();
    renderTm();
  });
  document.querySelector("#tm-burst").addEventListener("click", () => {
    for (let count = 0; count < 10 && !tmState.halted; count += 1) {
      tmStep();
    }
    renderTm();
  });
  document.querySelector("#tm-reset").addEventListener("click", () => {
    loadTmPreset(tmState.presetKey, tmState.initialTape);
    renderTm();
  });
  document.querySelector("#tm-preset").addEventListener("change", (event) => {
    const preset = tmPresets[event.target.value];
    document.querySelector("#tm-input").value = preset.tape;
    loadTmPreset(event.target.value, preset.tape);
    renderTm();
  });

  document.querySelector("#vn-preset").addEventListener("change", (event) => {
    document.querySelector("#vn-program").value = vnPresets[event.target.value].code;
    resetVnState(document.querySelector("#vn-program").value);
    renderVn();
  });
  document.querySelector("#vn-load").addEventListener("click", () => {
    try {
      resetVnState(document.querySelector("#vn-program").value);
      renderVn();
    } catch (error) {
      vnState.log = [error.message];
      renderVn();
    }
  });
  document.querySelector("#vn-phase").addEventListener("click", () => {
    vnNextPhase();
    renderVn();
  });
  document.querySelector("#vn-cycle").addEventListener("click", () => {
    for (let step = 0; step < 3 && !vnState.halted; step += 1) {
      vnNextPhase();
    }
    renderVn();
  });
  document.querySelector("#vn-reset").addEventListener("click", () => {
    try {
      resetVnState(vnState.programText || document.querySelector("#vn-program").value);
      renderVn();
    } catch (error) {
      vnState.log = [error.message];
      renderVn();
    }
  });
}

function initialize() {
  document.querySelector("#tm-preset").value = "selfMapCheck";
  document.querySelector("#tm-input").value = tmPresets.selfMapCheck.tape;
  document.querySelector("#vn-program").value = vnPresets.sum.code;
  loadTmPreset("selfMapCheck", tmPresets.selfMapCheck.tape);
  resetVnState(vnPresets.sum.code);
  attachEvents();
  updateScytale("encode");
  updateCaesarTransform("decode");
  updateCaesarAnalysis();
  updateVigenere("encode");
  updateEnigma();
  updateBombe();
  renderTm();
  renderVn();
}

window.render_game_to_text = () => JSON.stringify({
  scytale: document.querySelector("#scytale-output")?.textContent || "",
  caesar: document.querySelector("#caesar-output")?.textContent || "",
  enigma: document.querySelector("#enigma-output")?.textContent || "",
  tm: {
    state: tmState.state,
    head: tmState.head,
    steps: tmState.steps,
    tape: [...tmState.tape.entries()].slice(0, 12),
  },
  computerIO: {
    pc: vnState.pc,
    acc: vnState.acc,
    phase: vnState.phase,
  },
});

window.advanceTime = (milliseconds = 1000) => {
  const tmSteps = Math.max(1, Math.round(milliseconds / 250));
  for (let step = 0; step < tmSteps && !tmState.halted; step += 1) {
    tmStep();
  }
  renderTm();
};

document.addEventListener("DOMContentLoaded", initialize);



