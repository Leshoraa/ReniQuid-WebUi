ReniQuid
========

What is it?
-----------

ReniQuid is a high-fidelity Zero-G fluid simulation engine designed for minimalist glassmorphism UI. Unlike traditional CSS filters, ReniQuid utilizes WebGL 2.0 to simulate pure water dynamics in a microgravity environment. 

The engine focuses on "Critical Damping" to ensure fluid movement is realistic.

Core Architecture
-----------------

1. **Zero-G Fluid Physics (Damped Harmonic Oscillator)**
   The motion logic is governed by a critically damped system ($\zeta = 1$). This ensures that when the fluid is dragged or moved via impulse, it settles into its equilibrium state without overshoot or oscillation.

   $$m\frac{d^2x}{dt^2} + c\frac{dx}{dt} + kx = 0$$

2. **SDF Volumetric Rendering (Signed Distance Fields)**
   ReniQuid does not use meshes. It renders geometry through SDFs, allowing for seamless merging of fluid masses using the Smooth Minimum ($smin$) function. This creates the characteristic "merging droplets" look of real liquids.

3. **Sub-Pixel Optical Simulation (Prism & Refraction)**
   The engine implements a standard Chromatic Aberration (Prism Effect) by varying the Index of Refraction (IOR) across the RGB channels:
   * $n_{Red} \approx 1.32$
   * $n_{Green} \approx 1.33$
   * $n_{Blue} \approx 1.34$

4. **Surface Tension Integrity (Young-Laplace Logic)**
   To maintain the "blob" shape in zero gravity, the shader calculates surface tension forces to minimize surface area, resulting in a natural spherical resting state.

Screenshot
----------

![ReniQuid Showcase](https://github.com/Leshoraa/ReniQuid/blob/main/Screenshot.png?raw=true)

Technical Specifications
------------------------

* **Kernel:** WebGL 2.0 (#version 300 es)
* **Language:** Pure Vanilla JavaScript
* **Physics:** Critically Damped Inertia
* **Optics:** IOR-based Refraction + Ambient Soft Shadows

---

*Code is written to be executed by machines, understood by humans. Don't reverse it.*
