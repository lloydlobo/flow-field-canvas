// static/flow_field.js

/** @fileoverview Flow field simulation script.  */

/** Indicates whether the script is running in debug mode. @type {boolean} */
const __DEBUG = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

__DEBUG && console.time("simulation");

// --------------------------------------------------------------------------------------------------------------------
// CONSTANTS

/** Golden ratio constant. @type {number} */
const PHI = 1.61803398875;
const PHI_INV = 1 / PHI;
const PI_INV = 1 / Math.PI;

/** Multiplier for frames per second (ms). @type {number} */
const FPS_MULTIPLIER = 0.001; //  is this ms?

/** Resistance factor for controlling frames per second. @type {number} */
const FPS_RESISTANCE = (60 * FPS_MULTIPLIER) / 3.65; // HACK to control FPS with this.

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
// UTILITIES

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
     * Utils.clamp(5, 0, 10); // Returns 5 * // Clamping within the range
     * Utils.clamp(-5, 0, 10); // Returns 0 * // Clamping below the minimum
     * Utils.clamp(15, 0, 10); // Returns 10 * // Clamping above the maximum
     * Utils.clamp(7, 5, 5); // Returns 5 * // Clamping with equal minimum and maximum
     * Utils.clamp(-8, -10, -5); // Returns -8 * // Clamping with negative values
     * @returns {number} - The clamped value.
     */
    static clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
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

    /**
     * @param {number} a - Start value.
     * @param {number} b - End value.
     * @param {number} value - Extrapolated value.
     * @returns {number} Interpolated factor.
     */
    static inv_lerp(a, b, value) {
        if (b === a)
            throw new Error(
                `Cannot divide by 0 as start and end are same. Got ${(a, b, value)}`
            );
        return (value - a) / (b - a);
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
        // __DEBUG && Utils.assert(t >= 0.0 && t <= 1.0, `Expected interpolation factor t to be between 0.0 and 1.0. Got ${t}.`)  // (0.3)ms
        switch (t) {
            case 0.0:
                return a;
            case 1.0:
                return b;
            default:
                return (1.0 - t) * a + t * b;
        }
    }

    /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @returns {number} */
    static manhattan_distance(x1, y1, x2, y2) {
        return Math.abs(x2 - x1) + Math.abs(y2 - y1);
    }

    /**
     * Generates a range of numbers and returns as a list.
     * @param {number} start - The starting value of the range.
     * @param {number} end - The ending value of the range.
     * @param {number} [step=1] - The step between each number in the range (default: 1).
     * @example
     * const positiveRange = Utils.range(1, 5); // Output: [1, 2, 3, 4, 5]
     * const negativeRange = Utils.range(5, 1, -1); // Output: [5, 4, 3, 2, 1]
     * @returns {number[]} - Sequence of a range of numbers inclusive of values of each step between start and end.
     */
    static range_tolist(start, end, step = 1) {
        /** @type {number[]} */
        const lst = []; // Handle negative steps to ensure inclusive nature for range's start and end values.
        if (step > 0) for (let i = start; i <= end; i += step) lst.push(i);
        else for (let i = start; i >= end; i += step) lst.push(i);
        return lst;
    }

    /**
     * Generates a range of numbers.
     * @param {number} start
     * @param {number} end
     * @param {number} [step=1]
     * @returns {Generator<any, void, unknown>}
     */
    static *range(start, end, step = 1) {
        if (step > 0) for (let i = start; i <= end; i += step) yield i;
        else for (let i = start; i >= end; i += step) yield i;
    }

    /**
     * Naive sleep basic blocks the thread with a while loop counting via `Date.now()` that runs till `ms` milliseconds has elapsed.
     * @param {number|undefined} ms - Milliseconds to sleep the thread for. [default: 1000]
     */
    static sleep_basic(ms = 1000) {
        let start = Date.now();
        // __DEBUG && console.time(start);
        while (Date.now() - start < ms) { }
        // __DEBUG && console.timeEnd(start);
    }

    /**
     * @param {Number} ms
     */
    static sleep_perf(ms = 1000) {
        /** High-resolution time stamp in milliseconds, but it is based on a monotonic clock. This means that it provides a time value that continuously increases at a constant rate, unaffected by changes to the system clock or adjustments for daylight saving time */
        const end = ms + performance.now();
        while (performance.now() < end) { }
    }
}

class Perf {
    /**
     * Thanks to https://github.com/GoldLink21/Pixel-Sim/blob/6dd8ec7db4b398283cb02bf435122928b6175bd9/main.js#L6
     */
    constructor() {
        this.cur_time;
        this.counter = [];
    }

    test() {
        this.cur_time = performance.now();
    }

    test_end(n) {
        this.counter.push(performance.now() - this.cur_time);

        if (this.counter.length === n) {
            const now = this.counter.reduce((acc, cur) => acc + cur, 0);
            console.info({ perf_t: now / this.counter.length });
            this.counter = [];
        }
    }

    /**
     * @param {{fn: () => void, n: number, iterations: number}} [options]
     * @example Perf.bench_fn({ fn: () => Utils.sleep_perf(50), n: 10, iterations: 100 });
     */
    static bench_fn({ fn, n, iterations }) {
        (function () {
            const perf = new Perf();
            const n_logger = n > iterations ? iterations - 1 : n;

            for (let i = 0; i < iterations; i += 1) {
                perf.test();
                fn();
                perf.test_end(n_logger);
            }
        })();
    }
}

class Logging {
    static log_on_stop_animation() {
        console.info(`Simulation completed after ${g_frame_tick} ticks.`);
        console.info(`\tUnique scaled points collected = ${g_closest_points_map.size}`);
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
        /** @prop {FieldVector[]} [field] */
        this.field = FlowFieldFn.gen_field(this);
    }
}

const g_visited_path = new Set();
// --------------------------------------------------------------------------------------------------------------------
// DATA STRUCTURE TRAITS

/** Functions related to particles. */
// PERF: Group multiple drawing operations together and perform them in a batch.
// PERF: Minimize calls to ctx.save() and ctx.restore().
class ParticleFn {
    /** @deprecated */
    static _update(particle, field) {
        const force = field.lookup(particle.x, particle.y);
        particle.x += force.u * particle.x * particle.speed;
        particle.y += force.v * particle.y * particle.speed;
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
        const nx = g_closest_point.x * g_scale; // (0.3)ms
        const ny = g_closest_point.y * g_scale;
        {
            // draw visited field point
            // ctx.save();  // (0.7)ms
            if (true /* with_frames_elapsed_clr */) {
                // performance heavy (0.5:4.6)ms
                // truncate float to int; via bitwise NOT `~~`, to avoid imprecise painting on prev visited field point.
                CanvasFn.draw_point(nx, ny, `hsla(${-g_frame_tick * g_frame_tick_limit_360deg}, 50%, 50%, 0.0125`, 8);
            } else {
                // (0.3:0.6)ms
                CanvasFn.draw_point(nx, ny, "hsla(116, 50%, 50%, 0.0125", 8); //  hue 96 || 116 looks great.
            }
            // ctx.restore();
        }
        {
            // draw particle
            // ctx.save();
            if (false /* with_frames_elapsed_clr */) {
                /* performance heavy (0.4:1.0)ms */
                CanvasFn.draw_point(particle.x, particle.y, `hsla(${~~(-g_frame_tick * g_frame_tick_limit_360deg)}, 60%, 50%, 0.95)`, 3);
            } else {
                const with_close_point_graphics = false;
                const has_closest_flow_point = nx && ny;
                if (with_close_point_graphics && has_closest_flow_point) {
                    const fps = FPS_RESISTANCE * 1000; // _ * (1 / FPS_MULTIPLIER)
                    let xy_key = JSON.stringify({ x: Math.round(Math.round(particle.x * fps) * 0.1 * fps), y: Math.round(Math.round(particle.y * fps) * 0.1 * fps), }); /* Pixelate visited path to bigger numbers. */
                    if (false /* with_field_color */) {
                        CanvasFn.draw_point(particle.x, particle.y, "hsla(1, 55%, 50%, 0.90)", 3); // red looks great if clearing canvas and particles are a dot.
                    } else {
                        let ncolor = "hsla(240, 33%, 50%, 0.35";
                        ncolor = "hsla(1, 55%, 50%, 0.90)";
                        if (g_visited_path.has(xy_key))
                            ncolor = "hsla(180, 90%, 50%, 0.35)"; // console.count("visited")
                        CanvasFn.draw_point(particle.x, particle.y, ncolor, 8 || 3 || 4 || 1);
                    }
                    g_visited_path.add(xy_key);
                } else {
                    CanvasFn.draw_point(particle.x + 1, particle.y + 1, "hsla(106, 60%, 50%, 0.25)", 4); // CanvasFn.draw_point(particle.x, particle.y, "hsla(180, 90%, 50%, 0.35)", 1);
                    CanvasFn.draw_point(particle.x - 1, particle.y - 1, "hsla(250, 40%, 30%, 0.25)", 4); // CanvasFn.draw_point(particle.x, particle.y, "hsla(180, 90%, 50%, 0.35)", 1);
                    CanvasFn.draw_point(particle.x, particle.y, "hsla(1, 60%, 50%, 0.50)", 4); // CanvasFn.draw_point(particle.x, particle.y, "hsla(180, 90%, 50%, 0.35)", 1);
                }
            } // hue _ || 1 looks great.
            // ctx.restore();
        }
    }

    /**
     * Updates the particle's position based on the flow field data.
     * @param {Particle} [mut_particle] - Mutable pointer to a `Particle`.
     * @param {FlowField} data - Flow field data.
     * TIP: use perfect square ratios for interpolation. Adjust to vary velocity/thrust/drift/inertia.
     */
    static update_particle_via_field(mut_particle, data, is_lerped = true, t_interpolate = 1.0) {
        const p_x = mut_particle.x / g_scale;
        const p_y = mut_particle.y / g_scale;

        /** @type {FlowVector} */
        const flow_vector = ParticleFn._get_flow_vector_at_position(p_x, p_y, data, !true /*with_manhattan_distance*/); // (1.6)ms
        const resistance = g_scale * FPS_RESISTANCE;
        const nforceu = flow_vector.u * resistance;
        const nforcev = flow_vector.v * resistance;

        if (is_lerped) {
            // Smooth particle trail curves.
            mut_particle.x += Utils.lerp(p_x, nforceu, t_interpolate); // (0.7)ms
            mut_particle.y += Utils.lerp(p_y, nforcev, t_interpolate);
        } else {
            mut_particle.x += nforceu;
            mut_particle.y += nforcev;
        }

        // Wrap the particle around the canvas edges
        if (mut_particle.x < 0) mut_particle.x += g_canvas_width;
        else if (mut_particle.x > g_canvas_width) mut_particle.x -= g_canvas_width;
        if (mut_particle.y < 0) mut_particle.y += g_canvas_height;
        else if (mut_particle.y > g_canvas_height) mut_particle.y -= g_canvas_height;
    }

    /**
     * Gets the flow vector at a given position.
     * @param {number} x - X-coordinate.
     * @param {number} y - Y-coordinate.
     * @param {FlowField} data - Flow field data.
     * @returns {FlowVector} - Flow vector.
     */
    static _get_flow_vector_at_position(x, y, data, with_manhattan_distance = true) {
        const with_lru_cache = false;
        if (with_lru_cache) {
            let scale = ~~g_scale; // || Math.floor(g_scale);  // 72 -> 80 -> 40 -> 50.
            {
                scale += 10 - (scale % 10); // Round off to be a multiple of 10.
                scale *= 0.5; // Halve the value.
                scale += 10 - (scale % 10); // Round off to be a multiple of 10.
            }
            const key_xy = `${~~(x * scale)},${~~(y * scale)}`; /* (double bitwise NOT) `~~` == `Math.round()` */
            const lru_flow_vector = g_closest_points_map.get(key_xy);
            if (lru_flow_vector !== undefined) return lru_flow_vector;
        }
        // Find the closest data point to the given position.
        g_closest_point = data.reduce((closest, point) => {  /* 0.7ms */ /*vs*/ /* 17.2 ms */
            const dist = with_manhattan_distance
                ? Utils.manhattan_distance(x, y, point.x, point.y)
                : Math.hypot(point.x - x, point.y - y);
            return dist < closest.distance ? { point, distance: dist } : closest;
        }, { point: null, distance: Infinity }).point;

        const flow_vec = new FlowVector(g_closest_point.u, g_closest_point.v);
        with_lru_cache && g_closest_points_map.set(key_xy, flow_vec);

        return flow_vec; // Return the flow vector at the closest point
    }
}

class FlowFieldFn {
    /** @param {number} x @param {number} y @returns {FlowVector} u and v values of flow vector at x and y coordinates. */
    static lookup(flowfield, x, y) {
        const i = Math.floor(x / (canvas.width / flowfield.cols));
        const j = Math.floor(y / (canvas.width / flowfield.rows));
        return flowfield.field[i][j];
    }

    // static generate_field(flowfield) { //     return Array.from({ length: flowfield.cols }, () => Array.from({ length: flowfield.rows }, () => ( new CFlowVector( ((Math.random() * 2) - 1), ((Math.random() * 2) - 1),)))); // }

    /** @returns {FieldVector[]} Array of `CFieldVector` object that makes up a flow field */
    static gen_field(field) {
        const nrows = field.rows, ncols = field.cols, nsteps = field.steps, pattern = field.pattern;
        if (__DEBUG) {
            Utils.assert(Number.isInteger(nsteps), `Expected nsteps to be an integer. Got ${nsteps}.`);
            Utils.assert(Number.isInteger(Math.log2(nsteps)), `Expected nsteps to be a power of 2. nsteps is ${nsteps}.`);
            Utils.assert(nrows === ncols, `Expect count of rows and columns to be same. Got nrows: ${nrows}, ncols: ${ncols}.`);
        }

        const step = nrows / nsteps;
        const xvals = Utils.range_tolist(0, nrows, step);
        const yvals = Utils.range_tolist(0, ncols, step);

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
            xrow.map((x, j) => ({ x, y: ygrid[i][j], u: ugrid[i][j], v: vgrid[i][j], })) // (3.1:7.9)ms
        );
        if (__DEBUG) {
            Utils.assert(data.length === xgrid.length * xgrid[0].length, `Expected flow field data to have length similar to any of it's axis's rows or column.`);
            Utils.assert(Number.isInteger(Math.log2(data.length)), `Expected flow field data length to be a power of 2. Data length is ${data.length}.`);
        }
        return data;
    }

    static _map_flow_vectors(pattern, xgrid, ygrid) {
        /** @type {number[][] | undefined} */
        let ugrid, vgrid;

        switch (pattern) {
            case E_FIELD_PATTERNS.SINUSOIDAL:
                ugrid = ygrid.map((row) => row.map(Math.sin));
                vgrid = xgrid.map((row) => row.map(Math.cos));
                break;
            case E_FIELD_PATTERNS.INVERSE_SINUSOIDAL:
                ugrid = xgrid.map((row) => row.map(Math.cos));
                vgrid = ygrid.map((row) => row.map(Math.sin));
                break;
            case E_FIELD_PATTERNS.CLOCKWISE:
                ugrid = ygrid.map((row) => row.map((val) => -Math.sqrt(val * PHI_INV * PI_INV)));
                vgrid = xgrid.map((row) => row.map((val) => Math.sqrt(val * PHI_INV * PI_INV)));
                break;
            case E_FIELD_PATTERNS.ANTI_CLOCKWISE:
                ugrid = ygrid.map((row) => row.map((val) => Math.sqrt(val * PHI_INV * PI_INV)));
                vgrid = xgrid.map((row) => row.map((val) => Math.sqrt(val * PHI_INV * PI_INV)));
                break;
            default:
                throw new TypeError(`Expected an enumeration of ${Object.keys(E_FIELD_PATTERNS)} for field pattern. Got ${pattern}.`);
        }
        return { ugrid, vgrid };
    }
}

// --------------------------------------------------------------------------------------------------------------------
// DOM EVENT HANDLERS

function resize_canvas_field_offscreen(mut_canvas_field_offscreen) {
    mut_canvas_field_offscreen.width = canvas.width;
    mut_canvas_field_offscreen.height = canvas.height;
}

class EventHandlerFn {
    static reset_all() {
        if (true /* with_square_canvas */) {
            CanvasFn.set_square_canvas_dimensions();
        } else {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        g_particle.x = Math.random() * canvas.width + 0;
        g_particle.y = Math.random() * canvas.height + 0;

        // Following can lead to race conditions or cache miss like phenomenon if not handled properly.

        g_scale = canvas.width / g_field_shape;

        g_canvas_width = canvas.width;
        g_canvas_height = canvas.height;

        g_cell_count = g_canvas_width * g_canvas_height;

        g_closest_point = undefined;

        g_frame_tick = 1;

        g_is_drawn_once = false;

        g_closest_points_map.clear();
    }

    static #handle_resize_debounced = Utils.debounce(() => {
        EventHandlerFn.reset_all();  // For main canvas only.
        {  // For all other buffer/offscreen canvas.
            resize_canvas_field_offscreen(canvas_field_offscreen);
        }
    }, 200);

    static handle_resize() {
        EventHandlerFn.#handle_resize_debounced();
        (function () {
            canvas_field_offscreen.width = canvas.width;
            canvas_field_offscreen.height = canvas.height;
        })();
    }

    static handle_shuffle_field_pattern() {
        const keys = Object.keys(E_FIELD_PATTERNS);
        __DEBUG && Utils.assert(keys.includes(g_cur_field_pattern), `Expected current global field pattern to be a valid field pattern. Got ${g_cur_field_pattern}.\nAvailable:\n\t${JSON.stringify(keys)}`);

        const nkeys = keys.length;
        const cur_pattern_index = keys.findIndex((val) => val === g_cur_field_pattern);

        let rand_num = cur_pattern_index;
        while (rand_num === cur_pattern_index) rand_num = ~~(Math.random() * nkeys); // || Math.floor(Math.random() * nkeys);  // double bitwise NOT operator
        __DEBUG && Utils.assert(rand_num < nkeys && rand_num !== cur_pattern_index);

        g_cur_field_pattern = keys[rand_num];
        document.getElementById("cur_field_pattern_name").textContent = g_cur_field_pattern.toLowerCase(); //.replace("_", "-").replace(" ", "");

        g_field_instance = new FlowField(g_field_shape, g_field_shape, g_field_steps, g_cur_field_pattern);

        EventHandlerFn.handle_resize();
        CanvasFn.stop_animation(g_animation_frame_id_handle);
        animate(g_field_instance);
    }
}

// --------------------------------------------------------------------------------------------------------------------
// CANVAS TRAITS

class CanvasFn {
    /** @param {number} x @param {number} y @param {string} color @param {number} radius */
    static draw_point(x, y, color = "#fff", radius = 1) {
        // (1.6)ms
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color; // (9.1)ms
        ctx.lineCap = "round";
        ctx.fill();
        ctx.closePath();
    }

    /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {string} color @param {number} line_width */
    static draw_line(x1, y1, x2, y2, color = "#fff", line_width = 1) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        // ctx.quadraticCurveTo(1, 1, x2, y2);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = line_width;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.closePath();
    }

    /** @param {number} x @param {number} y @param {FlowVector} vector @param {number} scale @param {string} color @param {number} line_width */
    static draw_vector(x, y, vector, scale = 10, color = "#fff", line_width = 1) {
        const { u, v } = vector;
        CanvasFn.draw_line(x, y, x + u * scale, y + v * scale, color, line_width);
    }

    /** @param {number} x @param {number} y @param {number} angle @param {number} length @param {number} size @param {string} color @param {boolean} with_arrow_line */
    static draw_arrow(x, y, angle, length, size, color = "hsla(180, 90%, 50%, 1.0)", with_arrow_line = true) {
        if (with_arrow_line)
            length *= size * Math.PI * PHI || 0.618; /* performance heavy */
        {
            // magnitude: approx(min=0.4. max=79). multiply by prime 17 for wider distribution.
            let magnitude = size * length * 17;
            const h = 160 + Utils.clamp(magnitude, 1, 48);
            const s = Utils.clamp(20 + magnitude, 35, 90);
            const l = Utils.clamp(-20 + magnitude, 35, 60);
            color = `hsla(${h}, ${s}%, ${l}%, 1.0)`;
        }

        function draw_arrow_filled() {
            const end_x = x + length * Math.cos(angle);
            const end_y = y + length * Math.sin(angle);
            ctx_field_offscreen.strokeStyle = color;
            ctx_field_offscreen.lineCap = "round";
            // Draw arrow line
            if (with_arrow_line) {
                //  performance heavy
                ctx_field_offscreen.beginPath();
                ctx_field_offscreen.moveTo(x, y);
                ctx_field_offscreen.lineTo(end_x, end_y);
                ctx_field_offscreen.stroke();
            }
            // Draw arrowhead
            ctx_field_offscreen.save();
            ctx_field_offscreen.fillStyle = color;
            ctx_field_offscreen.translate(end_x, end_y);
            ctx_field_offscreen.rotate(angle);
            ctx_field_offscreen.beginPath();
            ctx_field_offscreen.moveTo(0, 0);
            ctx_field_offscreen.lineCap = "round";
            ctx_field_offscreen.lineTo(-size, -size);
            ctx_field_offscreen.lineTo(-size, size);
            ctx_field_offscreen.closePath();
            ctx_field_offscreen.fill();
            ctx_field_offscreen.restore();
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
        __DEBUG && console.timeEnd("simulation");
    }

    static set_square_canvas_dimensions() {
        const w = window.innerWidth, h = window.innerHeight;
        canvas.width = w;
        canvas.height = w < h ? w : h;
    }
}

// --------------------------------------------------------------------------------------------------------------------
// CANVAS SIMULATION SETUP

// Get the canvas and its 2D context
/**@type {HTMLCanvasElement | null} */
const canvas = document.getElementById("flowFieldCanvas");
__DEBUG && Utils.assert(canvas !== null, `Expected canvas id ${"flowFieldCanvas"} to be on a non-null HTMLCanvasElement.`);

/** @type {CanvasRenderingContext2D | null} */
const ctx = canvas?.getContext("2d");
__DEBUG && Utils.assert(ctx !== null, `Expected ctx to be non-null.`);

if (!canvas || !ctx) throw Error("Canvas or context not found.");

// Adapt to devices window size
if (/* with_square_canvas */ true) {
    CanvasFn.set_square_canvas_dimensions();
} else {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
canvas.style.background = "#101020" || "#334";
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

/*
  Double buffering
  - Perform drawing operations on ctx_offscreen.
  - Copy the canvas_offscreen to the main canvas.
  @example ctx.drawImage(canvas_offscreen, 0, 0);
*/
// /**@type {HTMLCanvasElement} */
// const canvas_offscreen = document.createElement("canvas");
// /** @type {CanvasRenderingContext2D} */
// const ctx_offscreen = canvas_offscreen.getContext("2d");

/**@type {HTMLCanvasElement} */
const canvas_field_offscreen = document.createElement("canvas");
/** @type {CanvasRenderingContext2D} */
const ctx_field_offscreen = canvas_field_offscreen.getContext("2d");

canvas_field_offscreen.width = canvas.width;
canvas_field_offscreen.height = canvas.height;
ctx_field_offscreen.imageSmoothingEnabled = true;
ctx_field_offscreen.imageSmoothingQuality = "high";

// window.addEventListener("mousemove", ev => { const mouse_x = ev.clientX, mouse_y = ev.clientY; console.info({ mouse_x, mouse_y }); })

// --------------------------------------------------------------------------------------------------------------------
// LOGIC SETUP

// Initialize global mutable objects

const g_particle = new Particle(Math.random() * canvas.width, Math.random() * canvas.height, 1, 2);
/** @const {particle[]} */
const g_particles = [];
/** @const {Map<string,FlowVector>} */
const g_closest_points_map = new Map();

// Initialize variables

/** @type {EFieldPatterns} */
let g_cur_field_pattern = E_FIELD_PATTERNS.SINUSOIDAL;
let g_field_has_arrows = false;
/** Number of field shapes. @type {number} */
let g_field_shape = 2 ** 3.5 || 13; // if field shape decides scaleFactor: 4 * 4 == 4 quadrants. A sinusoidal pattern creates at max 4 whole spirals.  else use atleast (4 * 2.5) or 10.
__DEBUG && Utils.assert(g_field_shape >= Math.fround(2 ** (Math.log(10) / Math.log(2))), `Expected field shape to be greater than 10. Got ${g_field_shape}.`); // 10
let g_field_steps = 2 ** (5 || 4); // Should be a power of 2, for bitwise operation while computing. // Field size =>1: 4|2: 16|3: 64|4: 256|5: 1024|6: 4096|7: 16384|...[((2 ** 5) ** 2) == 1024 == (2 ** 10)]
if (__DEBUG) {
    const shape_to_step_ratio = g_field_shape / g_field_steps;
    const shape_to_step_ratio_inv = 1 / shape_to_step_ratio;
    if (shape_to_step_ratio_inv <= 16 && g_field_shape < 2 ** 3.5)
        alert(JSON.stringify({ shape_to_step_ratio, shape_to_step_ratio_inv, g_field_shape, g_field_steps, }, null, 4));
}
let g_field_resolution = g_field_shape || 10; /* Doubt if this should affect scale here or, N_FIELD_SHAPE should??? */
let g_field_instance = new FlowField(g_field_shape, g_field_shape, g_field_steps, g_cur_field_pattern);
let g_scale = canvas.width / g_field_resolution; // 800 x 800 => 80 x 80, 10 * 1 unit pixel
let g_canvas_width = canvas.width;
let g_canvas_height = canvas.height;
let g_cell_count = g_canvas_width * g_canvas_height;
let g_frame_tick = 1;
let g_frame_tick_limit = Math.floor((60 * FPS_RESISTANCE) / FPS_MULTIPLIER) || Infinity; // {FPS_RESISTANCE = 0.02} :: {1200 frame_ticks in (35339:40946)ms} || {120 frame_ticks = 4343ms => 1 frame = 36ms approx}
{
    g_frame_tick_limit = Math.floor(g_frame_tick_limit * 6); // {1min if 10fps}
}
let g_frame_tick_limit_360deg = 360 / g_frame_tick_limit;
let g_frame_tick_animation_is_paused = false;

/** @type {FlowField|undefined} */
let g_flow_field_data;
/** @type {Particle|undefined} */
let g_closest_point;
/** @type {number|undefined} */
let g_animation_frame_id_handle; // To control the animation loop
let g_is_drawn_once = false;

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
    const arrow_size = Utils.clamp(n_points_per_cell / g_scale, ARROW_MIN_SIZE, ARROW_MAX_SIZE);

    // Define draw function for animation
    function draw() {
        g_frame_tick += 1;

        const with_particle_trail = true;
        if (!with_particle_trail) {
            __DEBUG && console.count("with_particle_trail"); // None
            CanvasFn.clear_canvas();
        }

        if (!g_is_drawn_once) {  // PERF: use pre-made sprites.
            __DEBUG && console.count("g_is_drawn_once"); // 1
            CanvasFn.clear_canvas();
            ctx_field_offscreen.clearRect(0, 0, canvas.width, canvas.height);
            ff.field.forEach((point) => {
                // Draw visualization based on data.
                CanvasFn.draw_arrow(
                    point.x * g_scale,
                    point.y * g_scale,
                    Math.atan2(point.v, point.u),
                    Math.sqrt(point.u ** 2 + point.v ** 2),
                    arrow_size,
                    /* color:*/ undefined,
                    g_field_has_arrows
                );
            });
            // Copy the content of the off-screen canvas to the visible canvas.
            ctx.drawImage(canvas_field_offscreen, 0, 0); // (42)ms
            g_is_drawn_once = true;
        }

        ParticleFn.update_particle_via_field(g_particle, ff.field, /* is_lerped */ true, /* t_interpolate */ 0.95);
        ParticleFn.draw_particle(g_particle);

        if (g_frame_tick > g_frame_tick_limit) {
            //  Break condition.
            CanvasFn.stop_animation(g_animation_frame_id_handle);
            __DEBUG && Logging.log_on_stop_animation();
            return;
        }
        g_animation_frame_id_handle = requestAnimationFrame(() => animate(ff)); // (5.8)ms  //  Request the next frame
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
    window.addEventListener("resize", EventHandlerFn.handle_resize);
    animate(g_field_instance);
}

// --------------------------------------------------------------------------------------------------------------------
// DOM EVENT LISTENERS GUI SETUP

document.getElementById("stop_animation_toggle")?.addEventListener("click", (_) => {
    CanvasFn.stop_animation(g_animation_frame_id_handle);
});
document.getElementById("reload_animation_toggle")?.addEventListener("click", (_) => {
    CanvasFn.stop_animation(g_animation_frame_id_handle);
    EventHandlerFn.reset_all();
    animate(g_field_instance);
});
document.getElementById("shuffle_field_toggle")?.addEventListener("click", (_) => {
    EventHandlerFn.handle_shuffle_field_pattern();
});
document.getElementById("gui_fps").textContent = `${Math.floor(FPS_RESISTANCE / FPS_MULTIPLIER)}fps`;

// --------------------------------------------------------------------------------------------------------------------
// SCRIPT EXECUTION

/** Initializes the simulation when the DOM content is loaded. */
document.addEventListener("DOMContentLoaded", (_) => {
    main();
});