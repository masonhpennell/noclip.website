// Misc utilities to help me debug various issues. Mostly garbage.

import { ReadonlyMat4, ReadonlyVec3, ReadonlyVec4, mat4, vec3, vec4 } from "gl-matrix";
import ArrayBufferSlice from "./ArrayBufferSlice.js";
import { divideByW } from "./Camera.js";
import { Blue, Color, Green, Magenta, OpaqueBlack, Red, colorToCSS } from "./Color.js";
import { downloadBuffer, downloadBufferSlice } from "./DownloadUtils.js";
import { AABB } from "./Geometry.js";
import { MathConstants, Vec3UnitX, Vec3UnitY, Vec3UnitZ, getMatrixAxisX, getMatrixAxisY, getMatrixAxisZ, getMatrixTranslation, lerp, transformVec3Mat4w0, vec3FromBasis2 } from "./MathHelpers.js";
import { Slider } from "./ui.js";
import { assertExists, hexzero, nArray } from "./util.js";

let _debugOverlayCanvas: CanvasRenderingContext2D | null = null;
export function getDebugOverlayCanvas2D(): CanvasRenderingContext2D {
    if (_debugOverlayCanvas === null) {
        const canvas = document.createElement('canvas');
        const ctx = assertExists(canvas.getContext('2d'));

        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';

        window.main.toplevel.insertBefore(canvas, window.main.canvas);
        _debugOverlayCanvas = ctx;

        prepareFrameDebugOverlayCanvas2D();
    }

    return _debugOverlayCanvas!;
}

export function prepareFrameDebugOverlayCanvas2D(): void {
    if (_debugOverlayCanvas !== null) {
        _debugOverlayCanvas.canvas.style.width = `${window.innerWidth}px`;
        _debugOverlayCanvas.canvas.style.height = `${window.innerHeight}px`;
        _debugOverlayCanvas.canvas.width = window.innerWidth * window.devicePixelRatio;
        _debugOverlayCanvas.canvas.height = window.innerHeight * window.devicePixelRatio;
    }
}

const p = nArray(10, () => vec4.create());

function transformToClipSpace(m: ReadonlyMat4, p: vec4[], nPoints: number): void {
    for (let i = 0; i < nPoints; i++)
        vec4.transformMat4(p[i], p[i], m);
}

function clipLineToPlane(da: vec4, db: vec4, a: ReadonlyVec4, b: ReadonlyVec4, plane: ReadonlyVec4): boolean {
    const dotA = vec4.dot(a, plane);
    const dotB = vec4.dot(b, plane);

    if (dotA < 0.0 && dotB < 0.0) {
        // Both are behind the plane. Don't draw it.
        return false;
    }

    const t = dotA / (dotA - dotB);
    if (dotA < 0.0)
        vec4.lerp(da, a, b, t);
    else
        vec4.copy(da, a);

    if (dotB < 0.0)
        vec4.lerp(db, a, b, t);
    else
        vec4.copy(db, b);

    return true;
}

const nearPlane = vec4.fromValues(0, 0, -1, 1);
function clipLineAndDivide(da: vec4, db: vec4, a: ReadonlyVec4, b: ReadonlyVec4): boolean {
    if (!clipLineToPlane(da, db, a, b, nearPlane))
        return false;

    divideByW(da, da);
    divideByW(db, db);
    return true;
}

function drawClipSpaceLine(ctx: CanvasRenderingContext2D, p0: ReadonlyVec4, p1: ReadonlyVec4, s0: vec4, s1: vec4): void {
    if (!clipLineAndDivide(s0, s1, p0, p1))
        return;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    ctx.moveTo((s0[0] + 1) * cw / 2, ((-s0[1] + 1) * ch / 2));
    ctx.lineTo((s1[0] + 1) * cw / 2, ((-s1[1] + 1) * ch / 2));
}

export function drawWorldSpaceLine(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, v0: ReadonlyVec3, v1: ReadonlyVec3, color: Color = Magenta, thickness = 2): void {
    vec4.set(p[0], v0[0], v0[1], v0[2], 1.0);
    vec4.set(p[1], v1[0], v1[1], v1[2], 1.0);
    transformToClipSpace(clipFromWorldMatrix, p, 2);

    ctx.beginPath();
    drawClipSpaceLine(ctx, p[0], p[1], p[8], p[9]);
    ctx.closePath();
    ctx.lineWidth = thickness;
    ctx.strokeStyle = colorToCSS(color);
    ctx.stroke();
}

const scratchVec3v = vec3.create();
export function drawWorldSpaceVector(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, pos: ReadonlyVec3, dir: ReadonlyVec3, mag: number, color: Color = Magenta, thickness = 2): void {
    vec3.scaleAndAdd(scratchVec3v, pos, dir, mag);
    drawWorldSpaceLine(ctx, clipFromWorldMatrix, pos, scratchVec3v, color, thickness);
}

const scratchMatrix = mat4.create();
const scratchVec3a = vec3.create();
const scratchVec3b = vec3.create();
export function drawWorldSpaceBasis(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, m: ReadonlyMat4, mag: number = 100, thickness = 2): void {
    getMatrixTranslation(scratchVec3a, m);

    getMatrixAxisX(scratchVec3b, m);
    drawWorldSpaceVector(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, mag, Red, thickness);

    getMatrixAxisY(scratchVec3b, m);
    drawWorldSpaceVector(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, mag, Green, thickness);

    getMatrixAxisZ(scratchVec3b, m);
    drawWorldSpaceVector(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, mag, Blue, thickness);
}

export function drawWorldSpaceLocator(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, pos: ReadonlyVec3, mag = 10, color = Magenta, thickness = 2): void {
    vec3.scaleAndAdd(scratchVec3a, pos, Vec3UnitX, -mag);
    vec3.scaleAndAdd(scratchVec3b, pos, Vec3UnitX, mag);
    drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, color, thickness);

    vec3.scaleAndAdd(scratchVec3a, pos, Vec3UnitY, -mag);
    vec3.scaleAndAdd(scratchVec3b, pos, Vec3UnitY, mag);
    drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, color, thickness);

    vec3.scaleAndAdd(scratchVec3a, pos, Vec3UnitZ, -mag);
    vec3.scaleAndAdd(scratchVec3b, pos, Vec3UnitZ, mag);
    drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b, color, thickness);
}

export function drawWorldSpaceAABB(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, aabb: AABB, m: ReadonlyMat4 | null = null, color: Color = Magenta): void {
    vec4.set(p[0], aabb.min[0], aabb.min[1], aabb.min[2], 1.0);
    vec4.set(p[1], aabb.max[0], aabb.min[1], aabb.min[2], 1.0);
    vec4.set(p[2], aabb.min[0], aabb.max[1], aabb.min[2], 1.0);
    vec4.set(p[3], aabb.max[0], aabb.max[1], aabb.min[2], 1.0);
    vec4.set(p[4], aabb.min[0], aabb.min[1], aabb.max[2], 1.0);
    vec4.set(p[5], aabb.max[0], aabb.min[1], aabb.max[2], 1.0);
    vec4.set(p[6], aabb.min[0], aabb.max[1], aabb.max[2], 1.0);
    vec4.set(p[7], aabb.max[0], aabb.max[1], aabb.max[2], 1.0);
    if (m !== null)
        for (let i = 0; i < 8; i++)
        vec4.transformMat4(p[i], p[i], m);
    transformToClipSpace(clipFromWorldMatrix, p, 8);

    ctx.beginPath();
    drawClipSpaceLine(ctx, p[0], p[1], p[8], p[9]);
    drawClipSpaceLine(ctx, p[1], p[3], p[8], p[9]);
    drawClipSpaceLine(ctx, p[3], p[2], p[8], p[9]);
    drawClipSpaceLine(ctx, p[2], p[0], p[8], p[9]);
    drawClipSpaceLine(ctx, p[4], p[5], p[8], p[9]);
    drawClipSpaceLine(ctx, p[5], p[7], p[8], p[9]);
    drawClipSpaceLine(ctx, p[7], p[6], p[8], p[9]);
    drawClipSpaceLine(ctx, p[6], p[4], p[8], p[9]);
    drawClipSpaceLine(ctx, p[0], p[4], p[8], p[9]);
    drawClipSpaceLine(ctx, p[1], p[5], p[8], p[9]);
    drawClipSpaceLine(ctx, p[2], p[6], p[8], p[9]);
    drawClipSpaceLine(ctx, p[3], p[7], p[8], p[9]);
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colorToCSS(color);
    ctx.stroke();
}

export function drawViewportSpacePoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: Color = Magenta, size: number = 4): void {
    const rad = size >>> 1;
    ctx.fillStyle = colorToCSS(color);
    ctx.fillRect(x - rad, ctx.canvas.height - y - rad, size, size);
}

function shouldCull(p: ReadonlyVec4, clipSpaceNearZ = window.main.viewer.gfxDevice.queryVendorInfo().clipSpaceNearZ): boolean {
    return p[0] < -1 || p[0] > 1 || p[1] < -1 || p[1] > 1 || p[2] < clipSpaceNearZ || p[2] > 1;
}

export function drawWorldSpacePoint(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, v: ReadonlyVec3, color: Color = Magenta, size: number = 4): void {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    vec4.set(p[0], v[0], v[1], v[2], 1.0);
    transformToClipSpace(clipFromWorldMatrix, p, 1);
    divideByW(p[0], p[0]);
    if (shouldCull(p[0]))
        return;

    const x = (p[0][0] + 1) * cw / 2;
    const y = (p[0][1] + 1) * ch / 2;
    drawViewportSpacePoint(ctx, x, y, color, size);
}

// https://jcgt.org/published/0006/01/01/
export function branchlessONB(dstA: vec3, dstB: vec3, n: ReadonlyVec3): void {
    const sign = n[2] >= 0.0 ? 1.0 : -1.0;
    const a = -1.0 / (sign + n[2]);
    const b = n[0] * n[1] * a;
    vec3.set(dstA, 1.0 + sign * n[0] * n[0] * a, sign * b, -sign * n[0]);
    vec3.set(dstB, b, sign + n[1] * n[1] * a, -n[1]);
}

export function drawWorldSpaceCircle(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, center: ReadonlyVec3, radius: number, axis: ReadonlyVec3, color = Magenta, nPoints: number = 32): void {
    for (let i = 0; i < nPoints; i++) {
        branchlessONB(scratchVec3a, scratchVec3b, axis);

        const t0 = ((i + 0) / nPoints) * MathConstants.TAU;
        vec3FromBasis2(scratchVec3v, center, scratchVec3a, Math.sin(t0) * radius, scratchVec3b, Math.cos(t0) * radius);

        const t1 = ((i + 1) / nPoints) * MathConstants.TAU;
        vec3FromBasis2(scratchVec3a, center, scratchVec3a, Math.sin(t1) * radius, scratchVec3b, Math.cos(t1) * radius);

        drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3v, scratchVec3a, color);
    }
}

export function drawWorldSpaceFan(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, center: ReadonlyVec3, radius: number, front: ReadonlyVec3, angle: number, axis: ReadonlyVec3): void {
    const nPoints = 32;
    for (let i = 0; i < nPoints; i++) {
        const t0 = lerp(-angle, angle, (i + 0) / (nPoints - 1));
        mat4.fromRotation(scratchMatrix, t0, axis);
        transformVec3Mat4w0(scratchVec3a, scratchMatrix, front);
        vec3.scaleAndAdd(scratchVec3a, center, scratchVec3a, radius);
        if (i === 0)
            drawWorldSpaceLine(ctx, clipFromWorldMatrix, center, scratchVec3a);

        const t1 = lerp(-angle, angle, (i + 1) / (nPoints - 1));
        mat4.fromRotation(scratchMatrix, t1, axis);
        transformVec3Mat4w0(scratchVec3b, scratchMatrix, front);
        vec3.scaleAndAdd(scratchVec3b, center, scratchVec3b, radius);
        if (i === nPoints - 1)
            drawWorldSpaceLine(ctx, clipFromWorldMatrix, center, scratchVec3b);

        drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b);
    }
}

export function drawWorldSpaceCylinder(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, center: ReadonlyVec3, radius: number, height: number, axis: ReadonlyVec3, nPoints: number = 32): void {
    for (let i = 0; i < nPoints; i++) {
        const t0 = ((i + 0) / nPoints) * MathConstants.TAU;
        mat4.fromRotation(scratchMatrix, t0, axis);
        transformVec3Mat4w0(scratchVec3a, scratchMatrix, Vec3UnitX);
        vec3.scaleAndAdd(scratchVec3a, center, scratchVec3a, radius);

        const t1 = ((i + 1) / nPoints) * MathConstants.TAU;
        mat4.fromRotation(scratchMatrix, t1, axis);
        transformVec3Mat4w0(scratchVec3b, scratchMatrix, Vec3UnitX);
        vec3.scaleAndAdd(scratchVec3b, center, scratchVec3b, radius);

        drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b);

        vec3.scaleAndAdd(scratchVec3b, scratchVec3a, axis, height);
        drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b);

        vec3.scaleAndAdd(scratchVec3a, scratchVec3a, axis, height);
        mat4.fromRotation(scratchMatrix, t1, axis);
        transformVec3Mat4w0(scratchVec3b, scratchMatrix, Vec3UnitX);
        vec3FromBasis2(scratchVec3b, center, scratchVec3b, radius, axis, height);
        drawWorldSpaceLine(ctx, clipFromWorldMatrix, scratchVec3a, scratchVec3b);
    }
}

interface TextOptions {
    font?: string;
    shadowColor?: string;
    shadowBlur?: number;
    outline?: number;
    align?: CanvasTextAlign;
}

export function drawScreenSpaceText(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: Color = Magenta, options: TextOptions = {}): void {
    ctx.fillStyle = colorToCSS(color);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = options.align ?? 'start';

    const fontSize = 14 * window.devicePixelRatio;
    ctx.font = options.font ?? `${fontSize}pt monospace`;

    if (options.outline) {
        const oldLineWidth = ctx.lineWidth;
        ctx.lineWidth = options.outline;
        ctx.strokeStyle = colorToCSS(OpaqueBlack, color.a);
        ctx.strokeText(text, x, y);
        ctx.lineWidth = oldLineWidth;
    }

    ctx.shadowColor = options.shadowColor ?? colorToCSS(OpaqueBlack, color.a);
    ctx.shadowBlur = options.shadowBlur ?? 0;
    ctx.fillText(text, x, y);
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 0;
}

export function drawWorldSpaceText(ctx: CanvasRenderingContext2D, clipFromWorldMatrix: ReadonlyMat4, v: ReadonlyVec3, text: string, offsY: number = 0, color: Color = Magenta, options: TextOptions = {}): void {
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    vec4.set(p[0], v[0], v[1], v[2], 1.0);
    transformToClipSpace(clipFromWorldMatrix, p, 1);
    divideByW(p[0], p[0]);
    if (shouldCull(p[0])) return;

    const x = ( p[0][0] + 1) * cw / 2;
    const y = (-p[0][1] + 1) * ch / 2 + offsY;

    drawScreenSpaceText(ctx, x, y, text, color, options);
}

export function drawScreenSpaceBox(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: Color = Magenta, lineWidth: number = 2): void {
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.closePath();
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = colorToCSS(color);
    ctx.stroke();
}

function flashItem(item: any, fieldName: string, step: number = 0) {
    item[fieldName] = step % 2 === 1;
    if (step < 7)
        setTimeout(() => { flashItem(item, fieldName, step + 1) }, 200);
}

function interactiveSliderSelect(items: any[], testItem: (itemIndex: number, v: boolean) => string | void, done: (itemIndex: number) => void): void {
    const panel = window.main.ui.debugFloaterHolder.makeFloatingPanel('SliderSelect');
    const slider = new Slider();
    // Revert to default style for clarity
    slider.elem.querySelector('input')!.classList.remove('Slider');
    panel.contents.append(slider.elem);

    const textLabel = document.createElement('div');
    textLabel.style.padding = '1em';
    panel.contents.append(textLabel);

    const doneButton = document.createElement('div');
    doneButton.textContent = 'Select';
    doneButton.style.background = '#333';
    doneButton.style.cursor = 'pointer';
    doneButton.style.padding = '1em';
    panel.contents.append(doneButton);

    slider.setRange(-1, items.length - 1, 1);

    slider.onvalue = (v: number) => {
        slider.setLabel('' + v);

        for (let i = 0; i < items.length; i++) {
            const label = testItem(i, (i <= v));
            if (i === v)
                textLabel.textContent = label ? label : '';
        }

        if (v < 0)
            textLabel.textContent = '';
    };

    slider.setValue(items.length - 1, true);

    doneButton.onclick = () => {
        const index = slider.getValue();
        panel.close();
        done(index);
    };

    panel.onclose = () => {
        done(-1);
    };
}

export function interactiveVizSliderSelect(items: any[], fieldName: string = 'visible', callback: ((obj: any, itemIndex: number) => void) | null = null): void {
    const visibleItems = items.filter((v) => v[fieldName]);

    interactiveSliderSelect(visibleItems, (i, v) => {
        const item = visibleItems[i];
        item[fieldName] = v;
        return item.name || item.constructor.name;
    }, (index) => {
        visibleItems.forEach((v) => v[fieldName] = true);
        if (index >= visibleItems.length || index < 0)
            return;
        const item = visibleItems[index];
        const origIndex = items.indexOf(item);
        flashItem(item, fieldName);
        console.log(`Found item @ ${origIndex}:`, item);
        if (callback !== null)
            callback(item, origIndex);
    });
}

export function bindSliderSelect(items: any[], fieldName: string = 'visible', callback: ((obj: any, itemIndex: number) => void) | null = null): void {
    interactiveVizSliderSelect(items, fieldName, (obj, itemIndex) => {
        window.main.ui.debugFloaterHolder.bindPanel(obj);
        if (callback !== null)
            callback(obj, itemIndex);
    });
}

function downloadBufferAny(name: any, buffer: any) {
    if (name.name && name.arrayBuffer)
        downloadBufferSlice(name.name, name);
    else if (buffer instanceof ArrayBufferSlice)
        downloadBufferSlice(name, buffer);
    else if (name.name && name.buffer)
        downloadBuffer(name.name, name.buffer);
    else if (buffer instanceof ArrayBuffer)
        downloadBuffer(name, buffer);
}

export function ghidraDecode(s: string, encoding = 'sjis'): string {
    // @ts-ignore
    const hex = new Uint8Array([...s.matchAll(/[0-9A-Fa-f]{2}h/g)].map((g) => parseInt(g[0].slice(0, 2), 16)));
    console.log([...hex].map((g) => g.toString(16)));
    return new TextDecoder(encoding).decode(hex);
}

export function hexdump(b_: ArrayBufferSlice | ArrayBuffer, offs: number = 0, length: number = 0x100): void {
    const buffer: ArrayBufferSlice = b_ instanceof ArrayBufferSlice ? b_ : new ArrayBufferSlice(b_);
    const groupSize_ = 16;
    let S = '';
    const arr = buffer.createTypedArray(Uint8Array, offs);
    length = Math.min(length, arr.byteLength);
    for (let i = 0; i < length; i += groupSize_) {
        let groupSize = Math.min(length - i, groupSize_);
        const addr = offs + i;
        S += `${hexzero(addr, 8)}    `;
        for (let j = 0; j < groupSize; j++) {
            const b = arr[i + j];
            S += ` ${hexzero(b, 2)}`;
        }
        for (let j = groupSize; j < groupSize_; j++)
            S += `   `;

        S += '  ';
        for (let j = 0; j < groupSize; j++) {
            const b = arr[i + j];
            const c = (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
            S += `${c}`;
        }
        for (let j = groupSize; j < groupSize_; j++)
            S += ` `;

        S += '\n';
    }
    console.log(S);
}

export function magicstr(v: number): string {
    v = v & 0xFFFFFFFF;
    const a0 = String.fromCharCode((v >>> 24) & 0xFF);
    const a1 = String.fromCharCode((v >>> 16) & 0xFF);
    const a2 = String.fromCharCode((v >>>  8) & 0xFF);
    const a3 = String.fromCharCode((v >>>  0) & 0xFF);
    return a0 + a1 + a2 + a3;
}

// This goes on window.main and is meant as a global "helper utils" thing.
export const debugJunk: any = {
    interactiveVizSliderSelect,
    bindSliderSelect,
    hexdump,
    magicstr,
    ghidraDecode,
    downloadBuffer: downloadBufferAny,
};
