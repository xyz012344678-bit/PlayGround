// The APEX HORIZON vehicle catalogue. All machines are original designs.
// Power figures are metric horsepower; speeds in km/h; weights in kg.

export const CATEGORIES = [
  'All', 'Hypercar', 'Supercar', 'Sports', 'Sedan', 'SUV', 'Off-road', 'Pickup',
  'Muscle', 'Classic', 'Electric', 'Racing', 'Drift', 'Rally', 'Van', 'Bus',
];

export const PAINT_COLORS = [
  { name: 'Solar Flare', hex: 0xff5a12, finish: 'metallic' },
  { name: 'Liquid Silver', hex: 0xc7ccd0, finish: 'metallic' },
  { name: 'Obsidian', hex: 0x14171c, finish: 'gloss' },
  { name: 'Arctic White', hex: 0xeceff1, finish: 'gloss' },
  { name: 'Signal Red', hex: 0xc41d22, finish: 'gloss' },
  { name: 'Nardo Grey', hex: 0x8a9095, finish: 'matte' },
  { name: 'Deep Navy', hex: 0x1d2d4d, finish: 'metallic' },
  { name: 'Forest Green', hex: 0x24462f, finish: 'metallic' },
  { name: 'Sunburst Yellow', hex: 0xf0b71e, finish: 'gloss' },
  { name: 'Electric Cyan', hex: 0x22c7d8, finish: 'metallic' },
  { name: 'Royal Purple', hex: 0x452b6b, finish: 'metallic' },
  { name: 'Copper Bronze', hex: 0xa5653a, finish: 'metallic' },
  { name: 'Crimson Chrome', hex: 0x7d1f24, finish: 'chrome' },
  { name: 'Gunmetal', hex: 0x3a3f45, finish: 'metallic' },
  { name: 'Satin Black', hex: 0x0b0d10, finish: 'matte' },
  { name: 'Pearl Blue', hex: 0x6fb5d8, finish: 'gloss' },
];

export const RIM_STYLES = [
  { id: 'split5', name: 'Split Five', spokes: 5, width: 0.09 },
  { id: 'mesh', name: 'Race Mesh', spokes: 10, width: 0.045 },
  { id: 'turbine', name: 'Turbine', spokes: 16, width: 0.035 },
  { id: 'offroad', name: 'Beadlock', spokes: 6, width: 0.14 },
  { id: 'classic', name: 'Chrome Disc', spokes: 0, width: 0.2 },
  { id: 'twin', name: 'Twin Spoke', spokes: 10, width: 0.07 },
];

export const RIM_COLORS = [
  { name: 'Satin Black', hex: 0x15171a },
  { name: 'Liquid Silver', hex: 0xc3c8cd },
  { name: 'Gunmetal', hex: 0x4b5158 },
  { name: 'Gold', hex: 0xb58a2e },
  { name: 'Bronze', hex: 0x8a5b32 },
  { name: 'White', hex: 0xe8eaec },
  { name: 'Chrome', hex: 0xd9dee2 },
  { name: 'Copper', hex: 0xb05c36 },
];

export const VEHICLES = [
  {
    id: 'apex-gtr', name: 'Apex GT-R', category: 'Hypercar', body: 'hyper', price: 0, owned: true,
    hp: 1020, torque: 980, weight: 1480, topSpeed: 352, accel: 2.4, drivetrain: 'AWD', gears: 8,
    handling: 0.94, braking: 0.92, drift: 0.74, color: 0xff5a12, finish: 'metallic',
    engine: { cylinders: 8, note: 'flat-plane twin-turbo V8' }, description: 'The festival halo car. Active aero, 1,020 hp and a chassis that refuses to blink.', grade: 'S1',
  },
  {
    id: 'zephyr-one', name: 'Zephyr One', category: 'Hypercar', body: 'hyper', price: 980000,
    hp: 1280, torque: 1120, weight: 1390, topSpeed: 380, accel: 2.1, drivetrain: 'AWD', gears: 8,
    handling: 0.97, braking: 0.95, drift: 0.7, color: 0xc7ccd0, finish: 'metallic',
    engine: { cylinders: 12, note: 'naturally aspirated V12 hybrid' }, description: 'A wind-tunnel sculpture with a V12 heart and a licence to disturb the peace.', grade: 'X',
  },
  {
    id: 'nova-x', name: 'Nova X', category: 'Electric', body: 'ev', price: 1200000,
    hp: 1900, torque: 1600, weight: 1950, topSpeed: 340, accel: 1.9, drivetrain: 'AWD', gears: 1,
    handling: 0.9, braking: 0.94, drift: 0.6, color: 0x22c7d8, finish: 'gloss',
    engine: { cylinders: 0, note: 'tri-motor electric' }, description: 'Silence, then violence. 1,900 hp of instant torque wrapped in a carbon tub.', grade: 'X',
  },
  {
    id: 'falcon-r', name: 'Falcon R', category: 'Supercar', body: 'super', price: 420000,
    hp: 720, torque: 760, weight: 1520, topSpeed: 325, accel: 3.0, drivetrain: 'RWD', gears: 7,
    handling: 0.9, braking: 0.89, drift: 0.82, color: 0xc41d22, finish: 'gloss',
    engine: { cylinders: 8, note: 'twin-turbo V8' }, description: 'A mid-engined scalpel with a wild edge. Lift off and it will teach you respect.', grade: 'S1',
  },
  {
    id: 'corsa-v12', name: 'Corsa V12', category: 'Supercar', body: 'super', price: 565000,
    hp: 830, torque: 720, weight: 1580, topSpeed: 342, accel: 2.9, drivetrain: 'RWD', gears: 7,
    handling: 0.91, braking: 0.9, drift: 0.8, color: 0xf0b71e, finish: 'gloss',
    engine: { cylinders: 12, note: 'naturally aspirated V12' }, description: 'Old-school theatre. A screaming V12, a gated shifter and no apologies.', grade: 'S1',
  },
  {
    id: 'aventa-sv', name: 'Aventa SV', category: 'Supercar', body: 'super', price: 780000,
    hp: 900, torque: 820, weight: 1450, topSpeed: 350, accel: 2.6, drivetrain: 'AWD', gears: 8,
    handling: 0.94, braking: 0.92, drift: 0.76, color: 0x24462f, finish: 'metallic',
    engine: { cylinders: 10, note: 'twin-turbo V10' }, description: 'A stealth-fighter silhouette with the manners of a fighter jet on afterburner.', grade: 'S2',
  },
  {
    id: 'kestrel-rs', name: 'Kestrel RS', category: 'Sports', body: 'sport', price: 185000, owned: true,
    hp: 480, torque: 540, weight: 1380, topSpeed: 295, accel: 3.9, drivetrain: 'RWD', gears: 6,
    handling: 0.86, braking: 0.84, drift: 0.86, color: 0x6fb5d8, finish: 'metallic',
    engine: { cylinders: 6, note: 'turbo straight-six' }, description: 'The every-road sports coupe. Balanced, playful and impossible to leave alone.', grade: 'A',
  },
  {
    id: 'driftline-s', name: 'Driftline S', category: 'Drift', body: 'drift', price: 240000,
    hp: 560, torque: 700, weight: 1320, topSpeed: 280, accel: 3.6, drivetrain: 'RWD', gears: 6,
    handling: 0.82, braking: 0.8, drift: 0.99, color: 0x452b6b, finish: 'gloss',
    engine: { cylinders: 6, note: 'big single-turbo straight-six' }, description: 'Built to go sideways. Hydraulic handbrake, angle kit and a permanent grin.', grade: 'A',
  },
  {
    id: 'mirage-370', name: 'Mirage 370', category: 'Sports', body: 'sport', price: 120000,
    hp: 400, torque: 460, weight: 1450, topSpeed: 270, accel: 4.5, drivetrain: 'RWD', gears: 6,
    handling: 0.83, braking: 0.8, drift: 0.84, color: 0xeceff1, finish: 'gloss',
    engine: { cylinders: 6, note: 'naturally aspirated flat-six' }, description: 'Simple, honest, rear-driven fun. The ideal first step into the horizon.', grade: 'B',
  },
  {
    id: 'regalia-l', name: 'Regalia L', category: 'Sedan', body: 'sedan', price: 210000,
    hp: 510, torque: 650, weight: 2050, topSpeed: 250, accel: 4.3, drivetrain: 'AWD', gears: 8,
    handling: 0.76, braking: 0.82, drift: 0.5, color: 0x14171c, finish: 'gloss',
    engine: { cylinders: 8, note: 'twin-turbo V8' }, description: 'A first-class lounge at 250 km/h. Massage seats sold separately.', grade: 'B',
  },
  {
    id: 'chancellor-v8', name: 'Chancellor V8', category: 'Sedan', body: 'sedan', price: 300000,
    hp: 620, torque: 780, weight: 2200, topSpeed: 280, accel: 4.0, drivetrain: 'AWD', gears: 8,
    handling: 0.79, braking: 0.84, drift: 0.52, color: 0xc3c8cd, finish: 'metallic',
    engine: { cylinders: 8, note: 'twin-turbo V8' }, description: 'Diplomatic immunity for your right foot. Imposing, effortless, quietly unhinged.', grade: 'A',
  },
  {
    id: 'terra-grand', name: 'Terra Grand', category: 'SUV', body: 'suv', price: 160000,
    hp: 420, torque: 620, weight: 2450, topSpeed: 240, accel: 5.4, drivetrain: 'AWD', gears: 8,
    handling: 0.68, braking: 0.74, drift: 0.4, color: 0xa5653a, finish: 'metallic',
    engine: { cylinders: 6, note: 'turbo inline-six' }, description: 'Seven seats, two tonnes of composure, and a horizon habit.', grade: 'B',
  },
  {
    id: 'highlander-x', name: 'Highlander X', category: 'SUV', body: 'suv', price: 220000,
    hp: 520, torque: 700, weight: 2350, topSpeed: 260, accel: 4.8, drivetrain: 'AWD', gears: 8,
    handling: 0.73, braking: 0.78, drift: 0.45, color: 0x24462f, finish: 'metallic',
    engine: { cylinders: 8, note: 'twin-turbo V8' }, description: 'A luxury block of granite with a heated steering wheel and launch control.', grade: 'A',
  },
  {
    id: 'trailblazer-4x4', name: 'Trailblazer 4x4', category: 'Off-road', body: 'offroad', price: 140000, owned: true,
    hp: 350, torque: 600, weight: 2100, topSpeed: 210, accel: 6.4, drivetrain: '4WD', gears: 8,
    handling: 0.65, braking: 0.7, drift: 0.5, color: 0x4c5a3c, finish: 'matte',
    engine: { cylinders: 6, note: 'turbo diesel straight-six' }, description: 'Locking diffs, a snorkel and no interest in tarmac. Your ticket to the wild.', grade: 'B',
  },
  {
    id: 'dune-stalker', name: 'Dune Stalker', category: 'Off-road', body: 'offroad', price: 260000,
    hp: 480, torque: 720, weight: 1950, topSpeed: 230, accel: 5.2, drivetrain: '4WD', gears: 7,
    handling: 0.7, braking: 0.74, drift: 0.62, color: 0xb59a68, finish: 'matte',
    engine: { cylinders: 8, note: 'supercharged V8' }, description: 'Long-travel suspension and 480 hp of dune-swallowing intent.', grade: 'A',
  },
  {
    id: 'titan-hauler', name: 'Titan Hauler', category: 'Pickup', body: 'pickup', price: 130000,
    hp: 450, torque: 780, weight: 2600, topSpeed: 220, accel: 6.0, drivetrain: '4WD', gears: 10,
    handling: 0.63, braking: 0.7, drift: 0.43, color: 0x1d2d4d, finish: 'metallic',
    engine: { cylinders: 8, note: 'turbo diesel V8' }, description: 'A rolling workshop. Hauls trailers, boulders and unreasonable amounts of gear.', grade: 'B',
  },
  {
    id: 'ranger-bolt', name: 'Ranger Bolt', category: 'Pickup', body: 'pickup', price: 95000,
    hp: 390, torque: 620, weight: 2300, topSpeed: 205, accel: 6.2, drivetrain: '4WD', gears: 8,
    handling: 0.66, braking: 0.71, drift: 0.48, color: 0xff5a12, finish: 'gloss',
    engine: { cylinders: 6, note: 'turbo V6' }, description: 'The weekend warrior. Bed full of bikes, tyres howling on gravel.', grade: 'B',
  },
  {
    id: 'thunderhead-428', name: 'Thunderhead 428', category: 'Muscle', body: 'muscle', price: 150000,
    hp: 520, torque: 720, weight: 1750, topSpeed: 260, accel: 4.2, drivetrain: 'RWD', gears: 6,
    handling: 0.74, braking: 0.76, drift: 0.9, color: 0x0b0d10, finish: 'matte',
    engine: { cylinders: 8, note: 'naturally aspirated V8' }, description: 'A big-block bruiser with a hood scoop and a taste for rear tyres.', grade: 'A',
  },
  {
    id: 'vandal-ss', name: 'Vandal SS', category: 'Muscle', body: 'muscle', price: 210000,
    hp: 610, torque: 800, weight: 1700, topSpeed: 280, accel: 3.8, drivetrain: 'RWD', gears: 6,
    handling: 0.76, braking: 0.78, drift: 0.92, color: 0xc41d22, finish: 'gloss',
    engine: { cylinders: 8, note: 'supercharged V8' }, description: 'Supercharged, stick-shift, and entirely unrepentant. Smoke is a feature.', grade: 'S1',
  },
  {
    id: 'belvedere-57', name: "Belvedere '57", category: 'Classic', body: 'classic', price: 180000,
    hp: 280, torque: 400, weight: 1600, topSpeed: 195, accel: 7.8, drivetrain: 'RWD', gears: 4,
    handling: 0.58, braking: 0.6, drift: 0.7, color: 0xe8e2d0, finish: 'gloss',
    engine: { cylinders: 8, note: 'carburetted V8' }, description: 'Chrome, whitewalls and a soundtrack from another century. Drive it slow.', grade: 'C',
  },
  {
    id: 'stallion-gt', name: 'Stallion GT', category: 'Classic', body: 'classic', price: 230000,
    hp: 330, torque: 430, weight: 1500, topSpeed: 215, accel: 6.8, drivetrain: 'RWD', gears: 5,
    handling: 0.64, braking: 0.66, drift: 0.78, color: 0xc41d22, finish: 'gloss',
    engine: { cylinders: 8, note: 'small-block V8' }, description: 'A 1960s fastback silhouette with modern brakes hiding underneath.', grade: 'B',
  },
  {
    id: 'volt-aero', name: 'Volt Aero', category: 'Electric', body: 'ev', price: 190000,
    hp: 620, torque: 800, weight: 2050, topSpeed: 250, accel: 3.2, drivetrain: 'AWD', gears: 1,
    handling: 0.82, braking: 0.86, drift: 0.55, color: 0xeceff1, finish: 'gloss',
    engine: { cylinders: 0, note: 'dual-motor electric' }, description: 'A glass-roofed electric grand tourer with silent, seamless thrust.', grade: 'A',
  },
  {
    id: 'ion-pulse', name: 'Ion Pulse', category: 'Electric', body: 'ev', price: 140000,
    hp: 500, torque: 700, weight: 1900, topSpeed: 235, accel: 4.0, drivetrain: 'AWD', gears: 1,
    handling: 0.8, braking: 0.84, drift: 0.52, color: 0x6fb5d8, finish: 'metallic',
    engine: { cylinders: 0, note: 'dual-motor electric' }, description: 'A compact electric rocket for city streets and coastal runs.', grade: 'B',
  },
  {
    id: 'circuit-prototype', name: 'Circuit Prototype', category: 'Racing', body: 'race', price: 1500000,
    hp: 1100, torque: 900, weight: 950, topSpeed: 400, accel: 2.0, drivetrain: 'RWD', gears: 7,
    handling: 0.99, braking: 0.99, drift: 0.66, color: 0x0b0d10, finish: 'matte', stripes: true,
    engine: { cylinders: 8, note: 'hybrid endurance V8' }, description: 'A Le Mans weapon with number plates. Downforce enough to drive on the ceiling.', grade: 'X',
  },
  {
    id: 'gt3-racer', name: 'GT3 Racer', category: 'Racing', body: 'race', price: 650000,
    hp: 650, torque: 620, weight: 1250, topSpeed: 310, accel: 3.0, drivetrain: 'RWD', gears: 6,
    handling: 0.96, braking: 0.96, drift: 0.7, color: 0x6fb5d8, finish: 'gloss', stripes: true,
    engine: { cylinders: 6, note: 'race straight-six' }, description: 'A customer GT3 built for the circuit and barely legal anywhere else.', grade: 'S2',
  },
  {
    id: 'gravel-king', name: 'Gravel King', category: 'Rally', body: 'rally', price: 230000,
    hp: 460, torque: 620, weight: 1450, topSpeed: 245, accel: 3.9, drivetrain: 'AWD', gears: 6,
    handling: 0.9, braking: 0.86, drift: 0.9, color: 0x1d2d4d, finish: 'gloss', stripes: true,
    engine: { cylinders: 4, note: 'turbo rally four' }, description: 'Anti-lag, gravel tyres and a light pod. Built for the road less travelled.', grade: 'S1',
  },
  {
    id: 'sideways-spec', name: 'Sideways Spec', category: 'Drift', body: 'drift', price: 280000,
    hp: 620, torque: 760, weight: 1350, topSpeed: 285, accel: 3.4, drivetrain: 'RWD', gears: 6,
    handling: 0.84, braking: 0.82, drift: 1.0, color: 0x8a9095, finish: 'matte', stripes: true,
    engine: { cylinders: 8, note: 'supercharged V8' }, description: 'Competition drift build. Fifty degrees of lock and a tyre budget to match.', grade: 'S1',
  },
  {
    id: 'nomad-van', name: 'Nomad Van', category: 'Van', body: 'van', price: 90000,
    hp: 320, torque: 520, weight: 2100, topSpeed: 195, accel: 7.5, drivetrain: 'FWD', gears: 7,
    handling: 0.55, braking: 0.65, drift: 0.35, color: 0x22c7d8, finish: 'gloss',
    engine: { cylinders: 4, note: 'turbo diesel four' }, description: 'A mobile base camp. Slow, spacious, and secretly the best road-trip car here.', grade: 'C',
  },
  {
    id: 'cityliner', name: 'CityLiner', category: 'Bus', body: 'bus', price: 120000,
    hp: 280, torque: 900, weight: 7800, topSpeed: 150, accel: 14.0, drivetrain: 'RWD', gears: 6,
    handling: 0.35, braking: 0.5, drift: 0.22, color: 0xeceff1, finish: 'gloss',
    engine: { cylinders: 6, note: 'turbo diesel six' }, description: 'Forty seats, one destination. The island’s most unlikely drift machine.', grade: 'D',
  },
];

// Physical dimensions and silhouettes by body archetype.
export const BODY_CONFIG = {
  hyper:   { length: 4.72, width: 2.06, height: 1.12, clearance: .13, wheelbase: 2.72, track: 1.76, wheelR: .345, wheelW: .30, rim: .24, cabinFront: .26, cabinRear: -.22, spoiler: true, splitter: true, exhaust: 2, profile: 'sport' },
  super:   { length: 4.55, width: 1.98, height: 1.19, clearance: .14, wheelbase: 2.65, track: 1.70, wheelR: .34, wheelW: .29, rim: .235, cabinFront: .25, cabinRear: -.20, spoiler: true, splitter: true, exhaust: 2, profile: 'sport' },
  sport:   { length: 4.42, width: 1.88, height: 1.31, clearance: .15, wheelbase: 2.58, track: 1.62, wheelR: .335, wheelW: .26, rim: .22, cabinFront: .23, cabinRear: -.20, spoiler: false, splitter: false, exhaust: 2, profile: 'sport' },
  drift:   { length: 4.52, width: 1.98, height: 1.29, clearance: .11, wheelbase: 2.62, track: 1.68, wheelR: .33, wheelW: .30, rim: .22, cabinFront: .22, cabinRear: -.20, spoiler: true, splitter: true, exhaust: 2, profile: 'sport', wide: true },
  sedan:   { length: 5.05, width: 1.92, height: 1.47, clearance: .16, wheelbase: 2.98, track: 1.66, wheelR: .355, wheelW: .25, rim: .23, cabinFront: .24, cabinRear: -.30, spoiler: false, splitter: false, exhaust: 2, profile: 'sedan' },
  suv:     { length: 4.95, width: 2.02, height: 1.83, clearance: .22, wheelbase: 2.94, track: 1.70, wheelR: .415, wheelW: .30, rim: .27, cabinFront: .25, cabinRear: -.34, spoiler: false, splitter: false, exhaust: 2, profile: 'suv' },
  offroad: { length: 4.90, width: 2.08, height: 1.95, clearance: .30, wheelbase: 2.90, track: 1.76, wheelR: .44, wheelW: .34, rim: .28, cabinFront: .24, cabinRear: -.30, spoiler: false, splitter: false, exhaust: 1, profile: 'suv', rack: true, bullbar: true },
  pickup:  { length: 5.55, width: 2.04, height: 1.87, clearance: .24, wheelbase: 3.35, track: 1.74, wheelR: .41, wheelW: .32, rim: .27, cabinFront: .16, cabinRear: -.10, spoiler: false, splitter: false, exhaust: 1, profile: 'pickup', bed: true },
  muscle:  { length: 5.02, width: 1.96, height: 1.34, clearance: .13, wheelbase: 2.92, track: 1.68, wheelR: .35, wheelW: .30, rim: .23, cabinFront: .17, cabinRear: -.22, spoiler: true, splitter: false, exhaust: 2, profile: 'classic', scoop: true },
  classic: { length: 4.95, width: 1.90, height: 1.36, clearance: .16, wheelbase: 2.90, track: 1.62, wheelR: .36, wheelW: .25, rim: .235, cabinFront: .18, cabinRear: -.24, spoiler: false, splitter: false, exhaust: 2, profile: 'classic', chrome: true },
  ev:      { length: 4.88, width: 1.96, height: 1.43, clearance: .15, wheelbase: 2.95, track: 1.68, wheelR: .36, wheelW: .26, rim: .24, cabinFront: .27, cabinRear: -.28, spoiler: false, splitter: false, exhaust: 0, profile: 'sedan', ev: true },
  race:    { length: 4.75, width: 2.04, height: 1.14, clearance: .10, wheelbase: 2.75, track: 1.78, wheelR: .35, wheelW: .32, rim: .24, cabinFront: .20, cabinRear: -.22, spoiler: true, splitter: true, exhaust: 1, profile: 'sport', wing: true },
  rally:   { length: 4.30, width: 1.90, height: 1.46, clearance: .22, wheelbase: 2.55, track: 1.62, wheelR: .37, wheelW: .30, rim: .24, cabinFront: .22, cabinRear: -.18, spoiler: true, splitter: false, exhaust: 1, profile: 'sport', rack: true, lightpod: true },
  van:     { length: 5.25, width: 2.00, height: 2.28, clearance: .20, wheelbase: 3.20, track: 1.70, wheelR: .38, wheelW: .28, rim: .25, cabinFront: .40, cabinRear: -.42, spoiler: false, splitter: false, exhaust: 1, profile: 'van' },
  bus:     { length: 10.2, width: 2.52, height: 3.10, clearance: .24, wheelbase: 5.90, track: 1.92, wheelR: .52, wheelW: .38, rim: .30, cabinFront: .46, cabinRear: -.46, spoiler: false, splitter: false, exhaust: 0, profile: 'bus' },
};

export const PROFILES = {
  sport: [
    [-.50, .78, .30, .57, .62, .58],
    [-.44, .92, .24, .68, .74, .72],
    [-.33, 1.00, .20, .77, .85, .78],
    [-.21, .98, .18, .77, .94, .62],
    [-.08, .95, .18, .76, .995, .57],
    [.08, .94, .18, .75, 1.00, .56],
    [.20, .96, .19, .72, .88, .71],
    [.34, .98, .22, .63, .73, .82],
    [.46, .91, .28, .57, .65, .68],
    [.50, .78, .33, .52, .58, .58],
  ],
  sedan: [
    [-.50, .84, .30, .55, .64, .66],
    [-.43, .94, .24, .65, .80, .78],
    [-.31, .99, .20, .73, .96, .72],
    [-.14, .98, .18, .75, 1.00, .62],
    [.10, .97, .18, .74, 1.00, .60],
    [.23, .98, .20, .71, .87, .74],
    [.38, .99, .24, .62, .72, .84],
    [.50, .85, .32, .55, .61, .68],
  ],
  suv: [
    [-.50, .88, .30, .50, .88, .82],
    [-.46, .97, .18, .58, .97, .88],
    [-.30, 1.00, .14, .68, 1.00, .92],
    [-.05, .98, .13, .70, 1.00, .93],
    [.16, .98, .14, .70, 1.00, .90],
    [.30, .99, .16, .65, .91, .88],
    [.43, 1.00, .20, .60, .76, .90],
    [.50, .90, .30, .53, .65, .78],
  ],
  pickup: [
    [-.50, .88, .30, .50, .56, .80],
    [-.46, .98, .27, .54, .58, .87],
    [-.36, 1.00, .23, .60, .60, .92],
    [-.23, .98, .21, .67, .92, .82],
    [-.08, .97, .18, .71, 1.00, .75],
    [.08, .96, .17, .71, 1.00, .72],
    [.23, .98, .19, .67, .84, .82],
    [.40, 1.00, .23, .60, .72, .90],
    [.50, .90, .32, .54, .64, .78],
  ],
  classic: [
    [-.50, .80, .30, .58, .64, .64],
    [-.42, .93, .22, .69, .80, .78],
    [-.30, 1.00, .18, .76, .92, .78],
    [-.14, .98, .18, .76, 1.00, .62],
    [.05, .97, .18, .75, 1.00, .60],
    [.20, .98, .20, .72, .86, .74],
    [.36, .99, .24, .64, .72, .84],
    [.47, .90, .30, .58, .62, .70],
    [.50, .82, .36, .55, .57, .60],
  ],
  van: [
    [-.50, .88, .19, .49, .92, .84],
    [-.45, .98, .13, .56, .99, .92],
    [-.20, 1.00, .10, .62, 1.00, .94],
    [.10, 1.00, .10, .63, 1.00, .93],
    [.27, .99, .13, .62, .99, .91],
    [.38, 1.00, .18, .59, .90, .90],
    [.47, .99, .24, .55, .70, .86],
    [.50, .90, .32, .52, .62, .74],
  ],
  bus: [
    [-.50, .92, .12, .35, .98, .90],
    [-.47, .99, .08, .40, 1.00, .95],
    [-.20, 1.00, .06, .43, 1.00, .97],
    [.15, 1.00, .06, .44, 1.00, .96],
    [.38, 1.00, .09, .43, .99, .95],
    [.47, .99, .14, .40, .96, .92],
    [.50, .94, .22, .38, .84, .80],
  ],
};

export function getVehicle(id) { return VEHICLES.find(v => v.id === id) || VEHICLES[0]; }

export function vehiclePerformance(v, upgrades = {}) {
  const e = upgrades.engine || 0, b = upgrades.brakes || 0, s = upgrades.suspension || 0, t = upgrades.turbo || 0;
  const hp = v.hp * (1 + e * 0.09 + t * 0.05);
  const top = v.topSpeed * (1 + e * 0.035 + t * 0.02);
  const accel = v.accel * (1 - e * 0.045 - t * 0.06);
  const handling = Math.min(1, v.handling + s * 0.025);
  const braking = Math.min(1, v.braking + b * 0.03);
  return { hp, top, accel, handling, braking, weight: v.weight };
}
