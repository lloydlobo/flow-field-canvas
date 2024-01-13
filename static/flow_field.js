// static/flow_field.js

const __DEBUG = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
if (__DEBUG) console.log("Flow Field Canvas");

// --------------------------------------------------------------------------------------------------------------------
// ENUMS

const E_FIELD_PATTERNS = Object.freeze({
    SINUSOIDAL: "SINUSOIDAL",
    INVERSE_SINUSOIDAL: "INVERSE_SINUSOIDAL",
    ANTI_CLOCKWISE: "ANTI_CLOCKWISE",
    CLOCKWISE: "CLOCKWISE",
});

// --------------------------------------------------------------------------------------------------------------------
// TYPES

/** @typedef {keyof typeof E_FIELD_PATTERNS} EFieldPatterns */
/** @typedef {{ x: number, y: number }} Particle */
/** @typedef {{ u: number, v: number }} FlowVector */
/** @typedef {{ x: number, y: number, u: number, v: number, }} FieldVector */
/** @typedef {FieldVector[]} FlowField */

// --------------------------------------------------------------------------------------------------------------------
// UI SETUP

const _CANVAS_ID = 'flowFieldCanvas';

/**@type {HTMLBodyElement | HTMLElement | null} */
const body = document.body;

// Get the canvas and its 2D context
/**@type {HTMLCanvasElement | null} */
const canvas = document.getElementById(_CANVAS_ID);
__DEBUG && assert(canvas !== null, `Expected canvas id ${_CANVAS_ID} to be on a non-null HTMLCanvasElement.`);

/** @type {CanvasRenderingContext2D | null} */
const ctx = canvas?.getContext('2d');
__DEBUG && assert(ctx !== null, `Expected ctx to be non-null.`);

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.background = '#334';

// Setup data control gui
/** @type {HTMLDivElement & { style: string; }} */
const div_data_gui = Object.assign(document.createElement("div"), { style: "position: absolute; top: 0; background: #336; display: grid; max-width: 10vw; width: 100%; opacity: 0.75;", });

/** @type {HTMLButtonElement & {innerText: string; style: string;}} */
const btn_stop_animation = Object.assign(document.createElement("button"), { innerText: "Stop", style: "background: #334; color: white;", });
btn_stop_animation.addEventListener("click", stop_animation);

/** @type {HTMLButtonElement & {innerText: string; style: string;}} */
const btn_random_pattern = Object.assign(document.createElement("button"), { innerText: "Shuffle", style: "background: #334; color: white;", });
btn_random_pattern.addEventListener("click", handle_shuffle_field_pattern);

div_data_gui?.appendChild(btn_random_pattern);
div_data_gui?.appendChild(btn_stop_animation);
body?.appendChild(div_data_gui);

// --------------------------------------------------------------------------------------------------------------------
// LOGIC SETUP

// Initialize constants
const PHI = 1.618;
const TICK_LIMIT = Math.floor(60 * 60 * 1) || Infinity;
const FPS_MULTIPLIER = 0.001;  //  is this ms?
const FPS_RESISTANCE = (60 * FPS_MULTIPLIER) / 3 // HACK to control FPS with this

/* if field shape decides scaleFactor: 4 * 4 == 4 quadrants. 
   A sinusoidal pattern creates at max 4 whole spirals.  else use atleast (4 * 2.5) or 10.  */
const N_FIELD_SHAPE = 4 * 2.5;

// Initialize variables
let g_scale = canvas.width / (N_FIELD_SHAPE || 10); // 640 x 640 // unit pixel
let g_canvas_width = canvas.width - (2 * 0);
let g_canvas_height = canvas.height - (2 * 0);
let g_cell_count = g_canvas_width * g_canvas_height;

// Initialize global mutable objects

let g_tick = 1;
let g_animation_frame_id; // To control the animation loop
/** @type {EFieldPatterns} */
let g_cur_field_pattern = E_FIELD_PATTERNS.SINUSOIDAL;
/** @type {FlowField | undefined} */
let flow_field_data;
/** @type {Particle | undefined} */
let g_closest_point = undefined;

/** @type {Particle} */
const g_particle = {
    x: Math.random() * canvas.width + 0,
    y: Math.random() * canvas.height + 0,
};
const g_closest_points_history = new Map();

// --------------------------------------------------------------------------------------------------------------------
// MAIN

window.addEventListener('resize', handle_resize);
flow_field_data = create_flow_field();
animate(flow_field_data);

// --------------------------------------------------------------------------------------------------------------------
// FUNCTIONS

function handle_resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    g_particle.x = Math.random() * canvas.width + 0;
    g_particle.y = Math.random() * canvas.height + 0;

    // Following can lead to race conditions or cache miss like phenomenons.
    g_scale = canvas.width / (N_FIELD_SHAPE || 10); // 640 x 640 // unit pixel
    g_canvas_width = canvas.width - (2 * 0);
    g_canvas_height = canvas.height - (2 * 0);
    g_cell_count = g_canvas_width * g_canvas_height;
    g_closest_point = undefined;
    g_tick = 1;

    g_closest_points_history.clear();
}

/**
 * Gets the flow vector at a given position.
 * 
 * @param {number} x - X-coordinate.
 * @param {number} y - Y-coordinate.
 * @param {FlowField} data - Flow field data.
 * @returns {FlowVector} - Flow vector.
 */
function get_flow_vector_at_position(x, y, data) {
    /*
        function get_flow_vector_at_position(x, y, data) {
            g_closest_point = data.reduce((closest, point) => {
                const distance = Math.hypot(point.x - x, point.y - y);
                return distance < closest.distance ? { point, distance } : closest;
            }, { point: null, distance: Infinity }).point;
            return { u: g_closest_point.u, v: g_closest_point.v };
        }
    */
    const closestPoint = data.reduce((closest, point) => {
        const distance = Math.hypot(point.x - x, point.y - y);
        // Find the closest data point to the given position
        if (distance < closest.distance) {
            g_closest_point = (point);
            return { point, distance };
        } else {
            g_closest_point = (closest.point);  // TODO: Is this redundant?
            return closest;
        }
    }, { point: null, distance: Infinity, }).point;

    return { u: closestPoint.u, v: closestPoint.v, };  // Return the flow vector at the closest point
}

/**
 * Draws the particle at the given coordinates.
 * 
 * @param {number} x - X-coordinate.
 * @param {number} y - Y-coordinate.
 */
function draw_particle(x, y) {
    const xscaled = g_closest_point.x * g_scale;
    const yscaled = g_closest_point.y * g_scale;
    // draw vsitied field point
    ctx.save();
    ctx.beginPath();
    ctx.arc(xscaled, yscaled, 3, 0, (2 * Math.PI));
    ctx.fillStyle = 'hsla(91, 90%, 50%, 0.6)';
    ctx.fill();
    ctx.restore();

    let color = 'hsla(1, 100%, 50%, 1.0)';

    if (/*_show_pull_on_particle ===*/ false) {
        const i = Math.abs(x - g_closest_point.x * g_scale);
        const j = Math.abs(y - g_closest_point.y * g_scale);
        const manhattan_distance = (i + j);
        const clr = 255 - (42.5 * Math.PI * (manhattan_distance * FPS_RESISTANCE));
        const rgb_variant = Math.floor(clr * 0.5);
        color = `rgb(255, 10, ${rgb_variant})`;
    }

    // draw particle
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

/**
 * Updates the particle's position based on the flow field data.
 * 
 * @param {FlowField} data - Flow field data.
 */
function update_particle(data) {
    const p_x = g_particle.x / g_scale;
    const p_y = g_particle.y / g_scale;

    /** @type {FlowVector} */
    const flow_vector = get_flow_vector_at_position(p_x, p_y, data);
    const resistance = g_scale * FPS_RESISTANCE;

    if (__with_lerp = true) {
        const pull_ratio_b_has_on_a = 0.92; //  Adjust to vary velocity/thrust/drift/inertia.
        g_particle.x += lerp(p_x, flow_vector.u * resistance, pull_ratio_b_has_on_a);
        g_particle.y += lerp(p_y, flow_vector.v * resistance, pull_ratio_b_has_on_a);
    } else {
        g_particle.x += flow_vector.u * resistance;
        g_particle.y += flow_vector.v * resistance;
    }

    // Wrap the particle around the canvas edges
    if (g_particle.x < 0) g_particle.x += g_canvas_width;
    else if (g_particle.x > g_canvas_width + 0) g_particle.x -= g_canvas_width;
    if (g_particle.y < 0) g_particle.y += g_canvas_height;
    else if (g_particle.y > g_canvas_height + 0) g_particle.y -= g_canvas_height;
}

// Define drawArrow function
function draw_arrow(x, y, angle, length, size) {
    let color = 'hsla(180, 90%, 50%, 1.0)';

    if (__with_field_strength_as_saturation = false) {
        const i = (x % angle) * length;
        const j = (y % angle) * length;
        const base_saturation = 30;
        const cur_sat = Math.max(base_saturation, Math.min(100, base_saturation * (1 + Math.abs(Math.sqrt(i * i + j * j)))));
        color = `hsla(180, ${Math.floor(cur_sat)}%  , 50%, 1.0)`;
    }

    if (__with_dynamic_tick_based_color = false) {  //  performance heavy
        const countdown_lerper = Math.atan2(g_tick, TICK_LIMIT);
        const base_hue = 180;
        color = `hsla(${base_hue - (countdown_lerper * Math.PI * 2)}, 90%, 50%, 1.0)`;
    }

    if (__with_dynamic_color = false) {  //  performance heavy
        const i = (x % angle) * length;
        const j = (y % angle) * length;
        const color_multiplier = 42.5;
        const red = 10;
        const green = (255 - color_multiplier * i);
        const blue = (255 - color_multiplier * j);
        color = (length < 0.5)
            ? `rgb(${Math.floor((255 - (red * 10)))}, ${Math.floor(green)}, ${Math.floor(blue)})`
            : `rgb(${Math.floor(red)}, ${Math.floor(green)}, ${Math.floor(blue)})`;
    }

    if (__with_arrow_line = true) {  //  performance heavy
        length *= (size * Math.PI);
    }

    function draw_arrow_filled() {
        const end_x = x + length * Math.cos(angle);
        const end_y = y + length * Math.sin(angle);
        ctx.strokeStyle = color;
        if (__with_arrow_line = true) {  //  performance heavy
            // Draw arrow line
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(end_x, end_y);
            ctx.stroke();
        }
        // Draw arrowhead
        ctx.save();
        ctx.fillStyle = color;
        ctx.translate(end_x, end_y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size, -size);
        ctx.lineTo(-size, size);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    draw_arrow_filled();
}

/**
 * Animates the flow field and particle.
 * 
 * @param {FlowField} data - Flow field data.
 */
function animate(data) {
    const n_data_points = data.length;
    // Using a bitwise right shift (>>) for division by 2^log2(n_data_points), which is equivalent to dividing g_cell_count by n_data_points.
    // NOTE: This optimization is valid when n_data_points is a power of 2.
    const n_points_per_cell = g_cell_count >> Math.log2(n_data_points);  // const n_points_per_cell = g_cell_count / n_data_points;
    const arrow_size = Math.min(Math.max(5.0, n_points_per_cell / g_scale), 4.0);

    // Define draw function for animation
    function draw() {
        g_tick += 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);  //  Clear the canvas

        data.forEach(point => {  //  Draw visualization based on data
            draw_arrow(
                (point.x * g_scale),
                (point.y * g_scale),
                Math.atan2(point.v, point.u),
                Math.sqrt(point.u ** 2 + point.v ** 2),
                arrow_size
            );
        });

        update_particle(data);
        draw_particle(g_particle.x, g_particle.y);

        if (g_tick > TICK_LIMIT) {  //  Break condition.
            __DEBUG && console.info(`Simulation completed after ${g_tick} ticks.`)
            stop_animation();
            return;
        }

        g_animation_frame_id = requestAnimationFrame(() => animate(data));  //  Request the next frame
    }

    // Start the animation loop
    draw();
}

// Stop the animation
function stop_animation() {
    cancelAnimationFrame(g_animation_frame_id);
}

/**
 * 
 * @returns {FlowField} Flat array of `FieldVector` object that makes up a flow field 
 */
function create_flow_field() {
    const nrows = N_FIELD_SHAPE;
    const ncols = N_FIELD_SHAPE;

    const nsteps = (2 ** 5);
    __DEBUG && assert(Number.isInteger(nsteps), `Expected nsteps to be an integer. Got ${nsteps}.`);
    __DEBUG && assert(Number.isInteger(Math.log2(nsteps)), `Expected nsteps to be a power of 2. nsteps is ${nsteps}.`)

    const step = nrows / nsteps;

    /** @type {number[]} */
    const xvals = range(0, nrows, step);  // const _xvals_dup = Array.from({ length: nsteps + 1 }, (_, i) => i * nshape / (nsteps));
    /** @type {number[]} */
    const yvals = range(0, ncols, step);

    /** @type {number[][]} */
    const xgrid = [];
    /** @type {number[][]} */
    const ygrid = [];

    for (let i = 0; i < nsteps; i += 1) {
        /** @type {number[]} */
        const xrow = [];
        /** @type {number[]} */
        const yrow = [];

        for (let j = 0; j < nsteps; j += 1) {
            xrow.push(xvals[j]);
            yrow.push(yvals[i]);
        }

        xgrid.push(xrow);
        ygrid.push(yrow);
    }

    // Calculate u and v arrays.
    /** @type {number[][] | undefined} */
    let ugrid;
    /** @type {number[][] | undefined} */
    let vgrid;
    switch (g_cur_field_pattern) {
        case E_FIELD_PATTERNS.SINUSOIDAL:
            ugrid = ygrid.map(row => row.map(Math.sin));
            vgrid = xgrid.map(row => row.map(Math.cos));
            break;
        case E_FIELD_PATTERNS.INVERSE_SINUSOIDAL:
            ugrid = xgrid.map(row => row.map(Math.cos));
            vgrid = ygrid.map(row => row.map(Math.sin));
            break;
        case E_FIELD_PATTERNS.ANTI_CLOCKWISE:
            ugrid = ygrid.map(row => row.map(val => -val));
            vgrid = xgrid.map(row => row);
            break;
        case E_FIELD_PATTERNS.CLOCKWISE:  // Should ugrid be assigned xgrid?
            ugrid = ygrid.map(row => row);
            vgrid = xgrid.map(row => row);
            break;
        default: throw Error(`Expected an enumeration of ${Object.keys(EFlowFieldKind)} for field pattern. Got ${g_cur_field_pattern}.`)
    }
    __DEBUG && assert(ugrid !== undefined && vgrid !== undefined, `Expected ugrid and vgrid to be initialized. Got "ugrid: ${ugrid}, vgrid: ${vgrid}"`);

    /** @type {FieldVector[]} */
    const data = xgrid.flatMap((xrow, i) =>
        xrow.map((x, j) => ({ x, y: ygrid[i][j], u: ugrid[i][j], v: vgrid[i][j] }))
    );
    __DEBUG && assert(data.length === (xgrid.length * xgrid[0].length), `Expected flow field data to have length similar to any of it's axis's rows or column.`);
    __DEBUG && assert(Number.isInteger(Math.log2(data.length)), `Expected flow field data length to be a power of 2. Data length is ${data.length}.`)

    return data;
}

function handle_shuffle_field_pattern() {
    /** @type {string[]} */
    const keys = Object.keys(E_FIELD_PATTERNS);
    __DEBUG && assert(keys.includes(g_cur_field_pattern), `Expected current global field pattern to be a valid field pattern. Got ${g_cur_field_pattern}.\nAvailable:\n\t${JSON.stringify(keys)}`)
    const nkeys = keys.length;

    const cur_pattern_index = keys.findIndex((val, idx, obj) => val === g_cur_field_pattern);
    let rand_num = cur_pattern_index;
    __DEBUG && assert(rand_num === cur_pattern_index);

    while (rand_num === cur_pattern_index) rand_num = Math.floor(Math.random() * nkeys);
    __DEBUG && assert(rand_num < nkeys && rand_num !== cur_pattern_index);

    g_cur_field_pattern = keys[rand_num];
    handle_resize();

    flow_field_data = create_flow_field();
    stop_animation()
    animate(flow_field_data);
}

// --------------------------------------------------------------------------------------------------------------------
// UTILS

/**
 * Asserts a boolean condition and throws an error with the specified message if the assertion fails.
 * 
 * @param {boolean} condition - Truthy or Falsy boolean condition.
 * @param {string} message - Error message to be displayed if assertion fails.
 * @example assert(1 === 2, 'Expect 1 to be equal to 1.')
 */
function assert(condition, message = "") {
    if (!condition) throw Error(`AssertionError: ${message}`);
}

/**
 * Lerp is linear interpolation of a to b where interpolation factor is t.
 * @param {number} a - Start value.
 * @param {number} b - End value.
 * @param {number} t - Interpolation factor.
 * @example 
 * // Find mid-point between 0 and 10.
 * lerp_val = lerp(0, 10, 0.5);
 * assert(lerp_val === 5, `Expected 5. Got ${lerp_val},`);
 * @returns {number} Linearly interpolated value.
 */
function lerp(a, b, t) {
    __DEBUG && assert(t >= 0.0 && t <= 1.0, `Expected interpolation factor t to be between 0.0 and 1.0. Got ${t}.`)
    return (1 - t) * a + t * b;
}

/**
 * Generates a range of numbers.
 * 
 * @param {number} start - The starting value of the range.
 * @param {number} end - The ending value of the range.
 * @param {number} step - The step between each number in the range (default: 1).
 * @example 
 * // Positive step
 * const positiveRange = range(1, 5); // Output: [1, 2, 3, 4, 5]
 * @example 
 * // Negative step
 * const negativeRange = range(5, 1, -1); // Output: [5, 4, 3, 2, 1]
 * @returns {number[]} - Sequence of a range of numbers inclusive of values of each step between start and end.
 */
function range(start, end, step = 1) {
    /** @type {number[]} */
    const lst = [];

    if (step > 0) {  // Handle negative steps to ensure inclusive nature for range's start and end values.
        for (let i = start; i <= end; i += step) lst.push(i);
    } else {
        for (let i = start; i >= end; i += step) lst.push(i);
    }

    return lst;
}

// --------------------------------------------------------------------------------------------------------------------

/*
    # COLOR SCHEME

    For common colors, remember approximate hue values: red (0-30), orange (30-60), yellow (60-90), green (90-120), blue (120-180), purple (180-240), pink (around 330).
    For saturation, start with 50% and adjust as needed.
    For lightness, consider the desired brightness: bright colors are often around 70-80%, while darker colors might be 30-40%.
    Alpha is typically 1 for opaque colors, but adjust for transparency effects.
*/
