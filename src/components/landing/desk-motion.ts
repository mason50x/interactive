const clamp = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

type InkPoint = { x: number; y: number; start: boolean };
const steps = 120;
const line = (ax: number, ay: number, bx: number, by: number) =>
  (t: number) => ({ x: mix(ax, bx, t), y: mix(ay, by, t) });
const designs = [
  [line(155, 260, 155, 590), line(155, 590, 485, 590),
    (t: number) => ({ x: 165 + 310 * t, y: 570 - 250 * 4 * t * (1 - t) })],
  [0, 1, 2].map(part => (t: number) => {
    const angle = (part + t) * Math.PI * 2;
    const radius = 12 + (part + t) * 48;
    return { x: 320 + Math.cos(angle) * radius, y: 430 + Math.sin(angle) * radius };
  }),
  [line(145, 430, 495, 430), line(145, 280, 145, 585),
    (t: number) => ({ x: 145 + 350 * t, y: 430 - Math.sin(t * Math.PI * 4) * 100 })],
  [line(185, 270, 185, 590), line(185, 590, 485, 590), line(485, 590, 185, 270)],
];
// Single-line lettering uses the same geometry for ink and pencil movement.
const glyphs: Record<string, number[][][]> = {
 "B":[[[0,1],[0,0],[.7,0],[1,.2],[.7,.5],[0,.5]],[[.7,.5],[1,.7],[.7,1],[0,1]]], "C":[[[1,.1],[.2,0],[0,.2],[0,.8],[.2,1],[1,.9]]],
 "²":[[[0,.1],[.2,0],[.4,.1],[0,.4],[.4,.4]]],
 "1":[[[.2,.2],[.5,0],[.5,1]],[[.1,1],[.9,1]]],
 "2":[[[0,.2],[.2,0],[.8,0],[1,.2],[.8,.4],[0,1],[1,1]]],
 "3":[[[0,0],[1,0],[.5,.45],[1,.55],[1,.85],[.8,1],[0,1]]],
 "5":[[[1,0],[0,0],[0,.5],[.8,.5],[1,.7],[.8,1],[0,1]]],
 "8":[[[.2,.5],[0,.2],[.2,0],[.8,0],[1,.2],[.8,.5],[.2,.5],[0,.8],[.2,1],[.8,1],[1,.8],[.8,.5]]],
 "+":[[[0,.5],[1,.5]],[[.5,0],[.5,1]]], "=":[[[0,.3],[1,.3]],[[0,.7],[1,.7]]],
 "F":[[[0,1],[0,0],[1,0]],[[0,.5],[.8,.5]]],

 A:[[[0,1],[.5,0],[1,1]],[[.2,.6],[.8,.6]]], E:[[[1,0],[0,0],[0,1],[1,1]],[[0,.5],[.8,.5]]],
 G:[[[1,.2],[.8,0],[.2,0],[0,.2],[0,.8],[.2,1],[1,1],[1,.5],[.55,.5]]],
 I:[[[.5,0],[.5,1]]], L:[[[0,0],[0,1],[1,1]]], M:[[[0,1],[0,0],[.5,.55],[1,0],[1,1]]],
 N:[[[0,1],[0,0],[1,1],[1,0]]], O:[[[.2,0],[.8,0],[1,.2],[1,.8],[.8,1],[.2,1],[0,.8],[0,.2],[.2,0]]],
 P:[[[0,1],[0,0],[.8,0],[1,.2],[1,.4],[.8,.5],[0,.5]]], R:[[[0,1],[0,0],[.8,0],[1,.2],[1,.4],[.8,.5],[0,.5]],[[.5,.5],[1,1]]],
 S:[[[1,.1],[.2,0],[0,.2],[.1,.4],[.9,.6],[1,.8],[.8,1],[0,.9]]], T:[[[0,0],[1,0]],[[.5,0],[.5,1]]],
 V:[[[0,0],[.5,1],[1,0]]], W:[[[0,0],[.2,1],[.5,.5],[.8,1],[1,0]]],
 Y:[[[0,0],[.5,.5],[1,0]],[[.5,.5],[.5,1]]],
};
function lettering(text: string, y: number, size: number) {
 return [...text].flatMap((char, index) => (glyphs[char] ?? []).map(path =>
   path.map(([x, dy]) => ({ x: 145 + index * size * .85 + x * size * .6, y: y + dy * size }))));
}
const titles = ["MOTION", "PATTERNS", "WAVES", "ANGLES"];
const notes = ["TRY AGAIN", "SPOT IT", "LISTEN", "TEST IT"];
const equations = ["F = MA", "1 1 2 3 5 8", "V = F L", "A² + B² = C²"];
const circle = (x: number, y: number, radius: number) => Array.from({length: 49}, (_,i) => ({x:x+Math.cos(i/48*Math.PI*2)*radius,y:y+Math.sin(i/48*Math.PI*2)*radius}));
const details = [
 [circle(320,320,19), [{x:350,y:310},{x:410,y:275},{x:398,y:297}], [{x:410,y:275},{x:383,y:277}]],
 [circle(320,430,18), circle(385,430,10), circle(415,470,14)],
 [[{x:215,y:305},{x:390,y:305}], [{x:215,y:295},{x:215,y:315}], [{x:390,y:295},{x:390,y:315}]],
 [[{x:185,y:562},{x:213,y:562},{x:213,y:590}], [{x:330,y:430},{x:375,y:410},{x:367,y:432}]],
];
const pages = designs.map((strokes, page) => {
 const paths = [
  ...lettering(titles[page], 115, 32),
  ...lettering(equations[page], 195, 22),
  ...strokes.map(stroke => Array.from({length: steps + 1}, (_, i) => stroke(i / steps))),
  ...details[page],
  ...lettering(notes[page], 690, 23),
 ];
 let cursor = 0, pointIndex = 0;
 const segments = paths.map((path, pathIndex) => {
   const length = path.slice(1).reduce((sum,p,i) => sum + Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
   const duration = Math.max(.055, length / 620);
   const destination = paths[pathIndex+1]?.[0] ?? path[path.length-1];
   const last = path[path.length-1];
   const travelDuration = Math.max(.07, Math.hypot(destination.x-last.x,destination.y-last.y)/950);
   const segment = { path, start: cursor, duration, travelDuration, index: pointIndex };
   cursor += duration + travelDuration;
   pointIndex += path.length;
   return segment;
 });
 return { segments, duration: cursor, points: paths.flatMap(path => path.map((p,i) => ({...p,start:i===0}))) };
});
export const PAGE_COUNT = pages.length;
export const DESK_CYCLE = Math.max(...pages.map(page => page.duration)) + 3.8;
export function handwritingForPage(page: number): InkPoint[] { return pages[page % PAGE_COUNT].points; }

export function sampleDeskMotion(time: number) {
 const elapsed = Math.max(0,time-.4);
 const cycle = elapsed % DESK_CYCLE;
 const current = Math.floor(elapsed / DESK_CYCLE) % PAGE_COUNT;
 const page = pages[current];
 const next = pages[(current+1)%PAGE_COUNT].points[0];
 const end = DESK_CYCLE-3.8;
 const fresh = cycle >= DESK_CYCLE-.55;
 let x=page.points[0].x, y=page.points[0].y, lift=0, ink=0;
 for(let i=0;i<page.segments.length;i++) {
  const segment=page.segments[i];
  if(cycle < segment.start) break;
  const t=clamp((cycle-segment.start)/segment.duration);
  const index=t*(segment.path.length-1);
  const lower=Math.floor(index), upper=Math.min(lower+1,segment.path.length-1);
  x=mix(segment.path[lower].x,segment.path[upper].x,index-lower);
  y=mix(segment.path[lower].y,segment.path[upper].y,index-lower);
  ink=(segment.index+index)/(page.points.length-1);
  if(t===1 && i<page.segments.length-1) {
   const travel=clamp((cycle-segment.start-segment.duration)/segment.travelDuration);
   const to=page.segments[i+1].path[0];
   x=mix(x,to.x,smooth(travel)); y=mix(y,to.y,smooth(travel));
   lift=.14*Math.sin(Math.PI*travel)**2;
  }
 }
 if(cycle>=end) {
  const last=page.points[page.points.length-1];
  const travel=smooth((cycle-end-1.5)/1.5);
  x=mix(last.x,next.x,travel); y=mix(last.y,next.y,travel);
  lift=.5*smooth((cycle-end)/.4)*(1-smooth((cycle-(DESK_CYCLE-.55))/.55));
 }
 return {x,y,lift,ink:fresh?0:ink,page:fresh?(current+1)%PAGE_COUNT:current,
 slide:fresh?0:smooth((cycle-end-.5)/1.65),fall:fresh?0:clamp((cycle-end-1.85)/1),
 sheetVisible:cycle<DESK_CYCLE-.75 || fresh};
}
