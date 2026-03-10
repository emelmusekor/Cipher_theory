// assets/js/advanced-animations.js

document.addEventListener("DOMContentLoaded", () => {
  // 1. Enigma Overlay & Animation Upgrade
  const originalUpdateEnigmaHardware = window.updateEnigmaHardware || updateEnigmaHardware;
  let enigmaAnimTimer = null;

  updateEnigmaHardware = function(frame, settings, fallbackWindows) {
    if (originalUpdateEnigmaHardware) {
      originalUpdateEnigmaHardware(frame, settings, fallbackWindows);
    }
    
    let svg = document.getElementById("enigma-svg-overlay");
    if (!svg) return;
    svg.innerHTML = "";
    clearTimeout(enigmaAnimTimer);
    
    if (!frame) return;

    const ids = [
      "enigma-hw-keyboard",
      "enigma-hw-plug",
      "enigma-hw-right",
      "enigma-hw-middle",
      "enigma-hw-left",
      "enigma-hw-reflector",
      "enigma-hw-left",
      "enigma-hw-middle",
      "enigma-hw-right",
      "enigma-hw-plug",
      "enigma-hw-lamp"
    ];
    
    const svgRect = svg.getBoundingClientRect();
    const points = ids.map((id, index) => {
      const el = document.getElementById(id);
      if (!el) return {x:0, y:0};
      const rect = el.getBoundingClientRect();
      const x = rect.left - svgRect.left + rect.width / 2;
      const yOffset = index > 5 ? 18 : 0; 
      const y = rect.top - svgRect.top + rect.height / 2 + yOffset;
      return {x, y};
    });
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    let d = `M ${points[0].x} ${points[0].y} `;
    for(let i=1; i<points.length; i++) {
      d += `L ${points[i].x} ${points[i].y} `;
    }
    
    path.setAttribute("d", d);
    path.setAttribute("class", "enigma-wire animate-wire");
    svg.appendChild(path);
    
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", "0");
    dot.setAttribute("cy", "0");
    dot.setAttribute("r", "5");
    dot.setAttribute("class", "enigma-pulse-dot");
    
    const motion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
    motion.setAttribute("dur", "0.86s");
    motion.setAttribute("repeatCount", "1");
    motion.setAttribute("fill", "freeze");
    motion.setAttribute("path", d);
    dot.appendChild(motion);
    
    svg.appendChild(dot);
  };

  // 2. Bombe Machine Scanning Effect
  const originalUpdateBombeHardware = window.updateBombeHardware || updateBombeHardware;
  updateBombeHardware = function(result, order, focus) {
    if (originalUpdateBombeHardware) {
      originalUpdateBombeHardware(result, order, focus);
    }
    const drums = [
      document.getElementById("bombe-drum-left"),
      document.getElementById("bombe-drum-middle"),
      document.getElementById("bombe-drum-right")
    ];
    if (focus && focus.status === 'none') {
      drums.forEach((d, i) => {
         const speed = (i + 1) * 2;
         d.style.transform = `rotate(${Math.random() * 360 * speed}deg)`;
         d.style.transition = 'transform 0.1s linear';
      });
    } else {
      drums.forEach(d => {
         d.style.transform = `rotate(0deg)`;
         d.style.transition = 'transform 0.4s ease-out';
      });
    }
  };

  // 3. Turing Machine Smooth Tape Sliding
  updateTmHardware = function() {
    const track = document.querySelector("#tm-machine-track");
    if (!track) return;
    
    track.style.display = 'flex';
    track.style.gap = '8px';
    track.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)';
    track.style.position = 'relative';
    
    const indexes = [...tmState.tape.keys()];
    let minIdx = Math.min(...indexes, tmState.head, 0) - 10;
    let maxIdx = Math.max(...indexes, tmState.head, 0) + 10;
    
    for (let i = minIdx; i <= maxIdx; i++) {
      let cell = document.getElementById(`tm-cell-${i}`);
      if (!cell) {
        cell = document.createElement("div");
        cell.id = `tm-cell-${i}`;
        cell.className = 'tm-machine-cell';
        cell.style.minWidth = '54px';
        cell.style.flexShrink = '0';
        cell.style.order = i;
        track.appendChild(cell);
      }
      cell.innerHTML = `<small>${i}</small><span>${tmRead(i)}</span>`;
      cell.className = `tm-machine-cell ${i === tmState.head ? 'active' : ''}`;
    }
    
    const headOffset = tmState.head * 62;
    track.style.transform = `translateX(${-headOffset}px)`;
    track.style.left = '50%';
    track.style.marginLeft = '-27px'; 
  
    const chipTarget = document.querySelector("#tm-state-chips");
    if (chipTarget) {
      chipTarget.innerHTML = "";
      const states = [...new Set([...Object.keys(currentTmPreset().transitions), currentTmPreset().accept])];
      states.forEach((state) => {
        const chip = document.createElement("div");
        chip.className = `tm-state-chip ${state === tmState.state ? "active" : ""}`.trim();
        chip.textContent = state;
        chipTarget.appendChild(chip);
      });
    }
    setText("#tm-machine-caption", `헤드는 ${tmState.head}칸에서 ${tmRead(tmState.head)}를 읽고, 상태 ${tmState.state}에 따라 다음 행동을 고릅니다.`);
  };
});
