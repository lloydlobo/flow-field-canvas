// static/flow_field.js

/** @fileoverview Flow field simulation script.  */

const __DEBUG = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");  /** Indicates whether the script is running in debug mode. @type {boolean} */
__DEBUG && console.log("Flow Field Canvas");
// __DEBUG && console.time("simulation");

// --------------------------------------------------------------------------------------------------------------------
// CONSTANTS

const CANVAS_ID = 'flowFieldCanvas';

/** Golden ratio constant. @type {number} */
const PHI = 1.618;

/** Multiplier for frames per second (ms). @type {number} */
const FPS_MULTIPLIER = 0.001; //  is this ms?

/** Resistance factor for controlling frames per second. @type {number} */
const FPS_RESISTANCE = (60 * FPS_MULTIPLIER) / 3; // HACK to control FPS with this

/** Number of field shapes. @type {number} */
const N_FIELD_SHAPE = 4 * 2.5; // if field shape decides scaleFactor: 4 * 4 == 4 quadrants. A sinusoidal pattern creates at max 4 whole spirals.  else use atleast (4 * 2.5) or 10.

const ARROW_MIN_SIZE = 2.0, ARROW_MAX_SIZE = 4.0;

// --------------------------------------------------------------------------------------------------------------------
// ENUMS

/** Enumeration of field patterns. @enum {string} */
const E_FIELD_PATTERNS = Object.freeze({
    SINUSOIDAL: "SINUSOIDAL",
    INVERSE_SINUSOIDAL: "INVERSE_SINUSOIDAL",
    ANTI_CLOCKWISE: "ANTI_CLOCKWISE",
    CLOCKWISE: "CLOCKWISE",
});

// --------------------------------------------------------------------------------------------------------------------
// TYPES

/** @typedef {keyof typeof E_FIELD_PATTERNS} EFieldPatterns */

/** @typedef {(args: any[]) => void} DebouncedFunction */

// --------------------------------------------------------------------------------------------------------------------
// LOGGING

class Logging {
    static log_on_stop_animation() {
        console.info(`Simulation completed after ${g_frame_tick} ticks.`);
        console.info(`\tUnique scaled points collected = ${g_closest_points_map.size}`);
    }
}

// --------------------------------------------------------------------------------------------------------------------
// UTILS

/** Utility class providing assertion and interpolation methods.  */
class Utils {
    /**
     * Asserts a boolean condition and throws an error with the specified message if the assertion fails.
     * @param {boolean} condition - Truthy or Falsy boolean condition.
     * @param {string} [message=""] - Error message to be displayed if assertion fails.
     * @example
     * Utils.assert(1 === 2, 'Expect 1 to be equal to 1.');
     */
    static assert(condition, message = "") {
        if (!condition) throw Error(`AssertionError: ${message}`);
    }

    /**
     * Clamps a value within a specified range.
     *
     * @param {number} value - The value to be clamped.
     * @param {number} min - The minimum allowed value.
     * @param {number} max - The maximum allowed value.
     * @example
     * // Clamping within the range
     * Utils.clamp(5, 0, 10); // Returns 5
     * // Clamping below the minimum
     * Utils.clamp(-5, 0, 10); // Returns 0
     * // Clamping above the maximum
     * Utils.clamp(15, 0, 10); // Returns 10
     * // Clamping with equal minimum and maximum
     * Utils.clamp(7, 5, 5); // Returns 5
     * // Clamping with negative values
     * Utils.clamp(-8, -10, -5); // Returns -8
     * @returns {number} - The clamped value.
     */
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    /**
     * Linear interpolation of a to b where the interpolation factor is t.
     * @param {number} a - Start value.
     * @param {number} b - End value.
     * @param {number} t - Interpolation factor.
     * @example
     * const lerp_val = Utils.lerp(0, 10, 0.5);
     * Utils.assert(lerp_val === 5, `Expected 5. Got ${lerp_val},`);
     * @returns {number} Linearly interpolated value.
     */
    static lerp(a, b, t) {
        __DEBUG && Utils.assert(t >= 0.0 && t <= 1.0, `Expected interpolation factor t to be between 0.0 and 1.0. Got ${t}.`)
        return (1 - t) * a + t * b;
    }

    /**
     * Generates a range of numbers.
     * @param {number} start - The starting value of the range.
     * @param {number} end - The ending value of the range.
     * @param {number} [step=1] - The step between each number in the range (default: 1).
     * @example
     * const positiveRange = Utils.range(1, 5); // Output: [1, 2, 3, 4, 5]
     * const negativeRange = Utils.range(5, 1, -1); // Output: [5, 4, 3, 2, 1]
     * @returns {number[]} - Sequence of a range of numbers inclusive of values of each step between start and end.
     */
    static range(start, end, step = 1) {
        /** @type {number[]} */
        const lst = [];

        if (step > 0) {  // Handle negative steps to ensure inclusive nature for range's start and end values.
            for (let i = start; i <= end; i += step) lst.push(i);
        } else {
            for (let i = start; i >= end; i += step) lst.push(i);
        }

        return lst;
    }

    /**
     * @param {DebouncedFunction} fn - The function to be debounced.
     * @param {number} delay - The delay in milliseconds.
     * @returns {() => void} - The debounced function.
     */
    static debounce(fn, delay) {
        let timeout_id;

        return function (...args) {
            clearTimeout(timeout_id);

            timeout_id = setTimeout(() => {
                /* Calls the function, substituting the specified object for the this value of the function, 
                   and the specified array for the arguments of the function. */
                fn.apply(this, args);
            }, delay);
        };
    }
}

// --------------------------------------------------------------------------------------------------------------------
// DATA STRUCTURES

/** Represents a particle with position, speed, and size. */
class Particle {
    /** @param {number} x - X-coordinate. @param {number} y - Y-coordinate. @param {number} speed - Particle speed. @param {number} size - Particle size. */
    constructor(x, y, speed, size) {
        this.x = x;
        this.y = y;
        this.speed = speed;
        this.size = size;
    }
}

/** Represents a flow vector with u and v components. */
class FlowVector {
    /** @param {number} u - U-component. @param {number} v - V-component. */
    constructor(u, v) {
        this.u = u;
        this.v = v;
    }
}

/** Represents a field vector with position (x, y) and flow components (u, v). */
class FieldVector {
    /** @param {number} x - X-coordinate, @param {number} y - Y-coordinate, @param {number} u - U-component, @param {number} v - V-component, */
    constructor(x, y, u, v) {
        this.x = x;
        this.y = y;
        this.u = u;
        this.v = v;
    }
}

/** Represents a flow field with specified columns, rows, steps, and pattern. */
class FlowField {
    /** @param {number} cols @param {number} rows @param {number} steps - Number of steps. @param {EFieldPatterns} pattern - Field pattern. */
    constructor(cols, rows, steps, pattern) {
        this.cols = cols;
        this.rows = rows;
        this.steps = steps;
        this.pattern = pattern;
        /** @prop {CFieldVector[]} [field] */
        this.field = FlowFieldFn.gen_field(this);
    }
}

// --------------------------------------------------------------------------------------------------------------------
// DATA STRUCTURE TRAITS

/** Functions related to particles. */
class ParticleFn {
    /** @deprecated */
    static _update(particle, field) {
        const force = field.lookup(particle.x, particle.y);
        particle.x += force.u * particle.x * particle.speed;
        particle.y += force.v * particle.y * particle.speed
    }

    /**
     * @deprecated 
     * @param {Particle} particle - A `Particle` instance. @param {CanvasRenderingContext2D} ctx - Canvas Rendering 2D Context */
    static _display(particle, ctx) {
        ctx.fillStyle = "#0099ff";
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }

    /** Draws the particle at the given coordinates. @param {Particle} [particle]  */
    static draw_particle(particle) {
        ctx.save();  // draw vsitied field point
        CanvasFn.draw_point(g_closest_point.x * g_scale, g_closest_point.y * g_scale, "hsla(91, 90%, 50%, 0.6", 3);
        ctx.restore();
        ctx.save();  // draw particle
        CanvasFn.draw_point(particle.x, particle.y, "hsla(1, 100%, 50%, 1.0)", 3);
        ctx.restore();
    }

    /**
     * Updates the particle's position based on the flow field data.
     * @param {Particle} [mut_particle] - Mutable pointer to a `Particle`.
     * @param {FlowField} data - Flow field data.
     */
    static update_particle_via_field(mut_particle, data, is_lerped = true) {
        const p_x = mut_particle.x / g_scale;
        const p_y = mut_particle.y / g_scale;

        /** @type {FlowVector} */
        const flow_vector = ParticleFn._get_flow_vector_at_position(p_x, p_y, data);
        const resistance = g_scale * FPS_RESISTANCE;

        if (is_lerped) {
            const pull_ratio_b_has_on_a = 0.97; //  Adjust to vary velocity/thrust/drift/inertia.
            mut_particle.x += Utils.lerp(p_x, flow_vector.u * resistance, pull_ratio_b_has_on_a);
            mut_particle.y += Utils.lerp(p_y, flow_vector.v * resistance, pull_ratio_b_has_on_a);
        } else {
            mut_particle.x += flow_vector.u * resistance;
            mut_particle.y += flow_vector.v * resistance;
        }

        // Wrap the particle around the canvas edges
        if (mut_particle.x < 0) mut_particle.x += g_canvas_width;
        else if (mut_particle.x > g_canvas_width + 0) mut_particle.x -= g_canvas_width;
        if (mut_particle.y < 0) mut_particle.y += g_canvas_height;
        else if (mut_particle.y > g_canvas_height + 0) mut_particle.y -= g_canvas_height;
    }

    /**
     * Gets the flow vector at a given position.
     * 
     * @param {number} x - X-coordinate.
     * @param {number} y - Y-coordinate.
     * @param {FlowField} data - Flow field data.
     * @returns {FlowVector} - Flow vector.
     */
    static _get_flow_vector_at_position(x, y, data) {
        const with_lru_cache = false;
        if (with_lru_cache) {
            let scale = Math.floor(g_scale);  // 72 -> 80 -> 40 -> 50.
            {
                scale += (10 - (scale % 10));  // Round off to be a multiple of 10.
                scale *= 0.5;  // Halve the value.
                scale += (10 - (scale % 10));  // Round off to be a multiple of 10.
            }
            const key_xy = `${Math.round(x * scale)},${Math.round(y * scale)}`;
            const lru_flow_vector = g_closest_points_map.get(key_xy)

            if (lru_flow_vector !== undefined) return lru_flow_vector;
        }

        g_closest_point = data.reduce((closest, point) => { // Find the closest data point to the given position
            const distance = Math.hypot(point.x - x, point.y - y);
            return distance < closest.distance ? { point, distance } : closest;
        }, { point: null, distance: Infinity, }).point;

        const flow_vector = new FlowVector(g_closest_point.u, g_closest_point.v);
        with_lru_cache && g_closest_points_map.set(key_xy, flow_vector);

        return flow_vector;  // Return the flow vector at the closest point
    }
}

class FlowFieldFn {
    /** @param {number} x @param {number} y @returns {FlowVector} u and v values of flow vector at x and y coordinates. */
    static lookup(flowfield, x, y) {
        const i = Math.floor(x / (canvas.width / flowfield.cols));
        const j = Math.floor(y / (canvas.width / flowfield.rows));
        return flowfield.field[i][j]
    }

    // static generate_field(flowfield) { //     return Array.from({ length: flowfield.cols }, () => Array.from({ length: flowfield.rows }, () => ( new CFlowVector( ((Math.random() * 2) - 1), ((Math.random() * 2) - 1),)))); // }

    /** @returns {FieldVector[]} Array of `CFieldVector` object that makes up a flow field */
    static gen_field(field) {
        const nrows = field.rows, ncols = field.cols, nsteps = field.steps, pattern = field.pattern;
        if (__DEBUG) {
            Utils.assert(Number.isInteger(nsteps), `Expected nsteps to be an integer. Got ${nsteps}.`);
            Utils.assert(Number.isInteger(Math.log2(nsteps)), `Expected nsteps to be a power of 2. nsteps is ${nsteps}.`)
            Utils.assert(nrows === ncols, `Expect count of rows and columns to be same. Got nrows: ${nrows}, ncols: ${ncols}.`);
        }

        const step = nrows / nsteps;
        const xvals = Utils.range(0, nrows, step);
        const yvals = Utils.range(0, ncols, step);

        /** @type {number[][]} */
        const xgrid = [], ygrid = [];

        for (let i = 0; i < nsteps; i += 1) {
            const xrow = [], yrow = [];
            for (let j = 0; j < nsteps; j += 1) {
                xrow.push(xvals[j]);
                yrow.push(yvals[i]);
            }
            xgrid.push(xrow);
            ygrid.push(yrow);
        }

        /** @type {number[][] | undefined} */
        let { ugrid, vgrid } = FlowFieldFn._map_flow_vectors(pattern, xgrid, ygrid);
        __DEBUG && Utils.assert(ugrid !== undefined && vgrid !== undefined, `Expected ugrid and vgrid to be initialized. Got "ugrid: ${ugrid}, vgrid: ${vgrid}"`);

        /** @type {FieldVector[]} */
        const data = xgrid.flatMap((xrow, i) =>
            xrow.map((x, j) => ({ x, y: ygrid[i][j], u: ugrid[i][j], v: vgrid[i][j] }))
        );
        if (__DEBUG) {
            Utils.assert(data.length === (xgrid.length * xgrid[0].length), `Expected flow field data to have length similar to any of it's axis's rows or column.`);
            Utils.assert(Number.isInteger(Math.log2(data.length)), `Expected flow field data length to be a power of 2. Data length is ${data.length}.`)
        }
        return data;
    }

    static _map_flow_vectors(pattern, xgrid, ygrid) {
        /** @type {number[][] | undefined} */
        let ugrid, vgrid;

        switch (pattern) {
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
            case E_FIELD_PATTERNS.CLOCKWISE: // Should ugrid be assigned xgrid?
                ugrid = ygrid.map(row => row);
                vgrid = xgrid.map(row => row);
                break;
            default: throw Error(`Expected an enumeration of ${Object.keys(E_FIELD_PATTERNS)} for field pattern. Got ${pattern}.`);
        }
        return { ugrid, vgrid };
    }
}

// --------------------------------------------------------------------------------------------------------------------
// DOM EVENT HANDLERS

class EventHandlerFn {
    static reset_all() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        g_particle.x = Math.random() * canvas.width + 0;
        g_particle.y = Math.random() * canvas.height + 0;
        // Following can lead to race conditions or cache miss like phenomenon if not handled properly.
        g_scale = canvas.width / N_FIELD_SHAPE;
        g_canvas_width = canvas.width;
        g_canvas_height = canvas.height;
        g_cell_count = g_canvas_width * g_canvas_height;
        g_closest_point = undefined;
        g_frame_tick = 1;
        g_closest_points_map.clear();
    }

    static _handle_resize_debounced = Utils.debounce(() => {
        EventHandlerFn.reset_all();
    }, 200);

    static handle_resize() {
        EventHandlerFn._handle_resize_debounced();
    }

    static handle_shuffle_field_pattern() {
        const keys = Object.keys(E_FIELD_PATTERNS);
        __DEBUG && (Utils.assert(keys.includes(g_cur_field_pattern), `Expected current global field pattern to be a valid field pattern. Got ${g_cur_field_pattern}.\nAvailable:\n\t${JSON.stringify(keys)}`));
        const nkeys = keys.length;
        const cur_pattern_index = keys.findIndex(val => val === g_cur_field_pattern);
        let rand_num = cur_pattern_index;
        while (rand_num === cur_pattern_index) rand_num = Math.floor(Math.random() * nkeys);
        __DEBUG && Utils.assert(rand_num < nkeys && rand_num !== cur_pattern_index);
        g_cur_field_pattern = keys[rand_num];
        g_field_instance = new FlowField(N_FIELD_SHAPE, N_FIELD_SHAPE, g_flow_field_steps, g_cur_field_pattern);
        EventHandlerFn.handle_resize();
        CanvasFn.stop_animation(g_animation_frame_id_handle)
        animate(g_field_instance);
    }
}

// --------------------------------------------------------------------------------------------------------------------
// CANVAS TRAITS

class CanvasFn {
    /** @param {number} x @param {number} y @param {string} color @param {number} radius */
    static draw_point(x, y, color = "#fff", radius = 1) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.closePath();
    }

    /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {string} color @param {number} line_width */
    static draw_line(x1, y1, x2, y2, color = "#fff", line_width = 1) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = line_width;
        ctx.stroke();
        ctx.closePath();
    }

    /** @param {number} x @param {number} y @param {FlowVector} vector @param {number} scale @param {string} color @param {number} line_width */
    static draw_vector(x, y, vector, scale = 10, color = "#fff", line_width = 1) {
        const { u, v } = vector;
        CanvasFn.draw_line(x, y, (x + (u * scale)), (y + (v * scale)), color, line_width);
    }

    /** @param {number} x @param {number} y @param {number} angle @param {number} length @param {number} size @param {string} color @param {boolean} with_arrow_line */
    static draw_arrow(x, y, angle, length, size, color = 'hsla(180, 90%, 50%, 1.0)', with_arrow_line = true) {
        let mut_length = length;

        if (with_arrow_line) {  //  performance heavy
            mut_length *= (size * Math.PI) * 0.618;
        }

        function draw_arrow_filled() {
            const end_x = x + mut_length * Math.cos(angle);
            const end_y = y + mut_length * Math.sin(angle);
            ctx.strokeStyle = color;
            // Draw arrow line
            if (with_arrow_line = true) {  //  performance heavy
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

    static clear_canvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    /** Stop the animation. @param {number} frame_id_handle */
    static stop_animation(frame_id_handle) {
        __DEBUG && Utils.assert(frame_id_handle !== undefined && frame_id_handle !== null && Number.isInteger(frame_id_handle), `Expected a valid animation frame_id_handle. Got ${frame_id_handle}.`);
        cancelAnimationFrame(frame_id_handle);
        __DEBUG && Logging.log_on_stop_animation();
        // __DEBUG && console.timeEnd("simulation");
    }
}

// --------------------------------------------------------------------------------------------------------------------
// CANVAS SIMULATION SETUP

// Get the canvas and its 2D context
/**@type {HTMLCanvasElement | null} */
const canvas = document.getElementById(CANVAS_ID);
__DEBUG && Utils.assert(canvas !== null, `Expected canvas id ${CANVAS_ID} to be on a non-null HTMLCanvasElement.`);

/** @type {CanvasRenderingContext2D | null} */
const ctx = canvas?.getContext('2d');
__DEBUG && Utils.assert(ctx !== null, `Expected ctx to be non-null.`);

if (!canvas || !ctx) {
    throw Error('Canvas or context not found.');
}

// Adapt to devices window size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
canvas.style.background = '#334';

// --------------------------------------------------------------------------------------------------------------------
// LOGIC SETUP

// Initialize global mutable objects

const g_particle = new Particle((Math.random() * canvas.width), (Math.random() * canvas.height), 1, 2);
/** @const {particle[]} */
const g_particles = []
/** @const {Map<string,FlowVector>} */
const g_closest_points_map = new Map();

// Initialize variables
/** @type {EFieldPatterns} */
let g_cur_field_pattern = E_FIELD_PATTERNS.SINUSOIDAL;
let g_flow_field_steps = 2 ** 5;
let g_field_instance = new FlowField(N_FIELD_SHAPE, N_FIELD_SHAPE, g_flow_field_steps, g_cur_field_pattern);
let g_scale = canvas.width / (N_FIELD_SHAPE || 10); // 800 x 800 => 80 x 80, 10 * 1 unit pixel
let g_canvas_width = canvas.width;
let g_canvas_height = canvas.height;
let g_cell_count = g_canvas_width * g_canvas_height;
let g_frame_tick = 1;
let g_frame_tick_limit = Math.floor(60 * FPS_RESISTANCE / FPS_MULTIPLIER) || Infinity;  // {FPS_RESISTANCE = 0.02} :: {1200 frame_ticks in (35339:40946)ms} || {120 frame_ticks = 4343ms => 1 frame = 36ms approx}
{
    g_frame_tick_limit = Math.floor(g_frame_tick_limit * PHI); // {1941 frame_ticks in (57000:70000)ms}
}
let g_frame_tick_animation_is_paused = false;
/** @type {FlowField|undefined} */
let g_flow_field_data;
/** @type {Particle|undefined} */
let g_closest_point;
/** @type {number|undefined} */
let g_animation_frame_id_handle; // To control the animation loop

// --------------------------------------------------------------------------------------------------------------------
// FUNCTIONS

/**
 * Animates the flow field and particle.
 * @param {FlowField} ff - Flow field.
 */
function animate(ff) {
    const n_data_points = ff.field.length;

    /** Using a bitwise right shift (>>) for division by 2^log2(n_data_points), which is equivalent to dividing g_cell_count by n_data_points. This optimization is valid when n_data_points is a power of 2.   
     * @example const n_points_per_cell = g_cell_count / n_data_points; */
    const n_points_per_cell = g_cell_count >> Math.log2(n_data_points);
    const arrow_size = Utils.clamp((n_points_per_cell / g_scale), ARROW_MIN_SIZE, ARROW_MAX_SIZE);

    // Define draw function for animation
    function draw() {
        g_frame_tick += 1;

        CanvasFn.clear_canvas();

        // Draw visualization based on data
        ff.field.forEach(point => {
            CanvasFn.draw_arrow(
                (point.x * g_scale),
                (point.y * g_scale),
                Math.atan2(point.v, point.u),
                Math.sqrt(point.u ** 2 + point.v ** 2),
                arrow_size
            );
        });

        ParticleFn.update_particle_via_field(g_particle, ff.field);

        ParticleFn.draw_particle(g_particle);

        if (g_frame_tick > g_frame_tick_limit) {  //  Break condition.
            CanvasFn.stop_animation(g_animation_frame_id_handle);
            __DEBUG && Logging.log_on_stop_animation();
            return;
        }

        g_animation_frame_id_handle = requestAnimationFrame(() => animate(ff));  //  Request the next frame
    }

    // Start the animation loop
    if (!g_frame_tick_animation_is_paused) {
        draw();
    }
}

/**
 * Main entrypoint.
 * @returns {void}
 */
function main() {
    window.addEventListener('resize', EventHandlerFn.handle_resize);
    animate(g_field_instance);
}

// --------------------------------------------------------------------------------------------------------------------
// DOM EVENT LISTENERS GUI SETUP

document.getElementById("stop_animation_toggle")?.addEventListener("click", _ => {
    CanvasFn.stop_animation(g_animation_frame_id_handle);
});

document.getElementById("reload_animation_toggle")?.addEventListener("click", _ => {
    CanvasFn.stop_animation(g_animation_frame_id_handle);
    EventHandlerFn.reset_all();
    animate(g_field_instance);
});

document.getElementById("shuffle_field_toggle")?.addEventListener("click", _ => {
    EventHandlerFn.handle_shuffle_field_pattern();
});

// --------------------------------------------------------------------------------------------------------------------
// SCRIPT EXECUTION

/** Initializes the simulation when the DOM content is loaded. */
document.addEventListener("DOMContentLoaded", () => {
    main()
});