import { GRID_H, GRID_W, SPRITES, colorWord, coloredNouns, animalNames, inventModel, portrayal, } from "@worldbuilder/contracts";
import { applyOps, placementError } from "./apply.js";
const TAGS = [
    [/castle|fortress|keep|palace/, "castle"],
    [/flood|moat|drown/, "flood"],
    [/river|stream|creek/, "river"],
    [/lake|pond/, "lake"],
    [/winter|snow|frozen|ice/, "winter"],
    [/beach|shore|ocean|sea/, "beach"],
    [/village|town|hamlet|houses/, "village"],
    [/forest|woods|grove|trees/, "forest"],
    [/tower|spire/, "tower"],
    [/bridge/, "bridge"],
    [/road|path|lane/, "road"],
    [/campfire|camp\b|fire/, "campfire"],
    [/boat|ship|sail/, "boat"],
    [/flower|garden/, "flowers"],
    [/knight/, "knight"],
    [/merchant|trader|shop/, "merchant"],
    [/child|kid/, "child"],
    [/villager|person|people|npc|character/, "villager"],
    [/cat/, "cat"],
    [/dog|hound/, "dog"],
    [/sign|plaque/, "sign"],
    [/well/, "well"],
    [/mountain|hill|cliff/, "hill"],
    [/dirt|mud/, "dirt"],
    [/desert|dune/, "desert"],
    [/remove|delete|clear away|get rid/, "remove"],
];
const PROPS = [
    [/\b(cars?|trucks?|bus|buses|vans?|taxi|jeeps?|automobiles?|wagons?)\b/i, "Car"],
    [/\b(planes?|airplanes?|jets?|helicopters?|rockets?|spaceships?)\b/i, "Plane"],
    [/\b(dragons?|dinosaurs?|monsters?)\b/i, "Dragon"],
    [/\b(horses?|ponies|pony)\b/i, "Horse"],
    [/\b(cows?|cattle|bulls?|oxen|ox)\b/i, "Cow"],
    [/\b(birds?|eagles?|chickens?|ducks?)\b/i, "Bird"],
    [/\b(bikes?|bicycles?|motorcycles?|scooters?)\b/i, "Bike"],
    [/\btents?\b/i, "Tent"],
    [/\b(fish|fishes|sharks?|whales?)\b/i, "Fish"],
    [/\b(robots?|androids?)\b/i, "Robot"],
    [/\b(barrels?|kegs?)\b/i, "Barrel"],
    [/\b(chests?|treasures?)\b/i, "Chest"],
    [/\b(statues?|monuments?)\b/i, "Statue"],
    [/\bballoons?\b/i, "Balloon"],
    [/\bbenches\b|\bbench\b/i, "Bench"],
    [/\b(lanterns?|lamps?)\b/i, "Lamp"],
];
export function skyAsk(requests) {
    const text = requests.map((request) => request.text).join(" \n ");
    let sky = null;
    for (const match of text.matchAll(/\b(night(?:time)?|night\s+time|after dark|moonlight|daytime|day\s+time|sunrise|morning|day)\b/gi)) {
        const word = match[1].toLowerCase();
        sky = word.startsWith("night") || word === "after dark" || word === "moonlight" ? "night" : "day";
    }
    return sky;
}
function sameKind(noun, label, sprite) {
    const asked = portrayal(noun);
    if (asked === "tree" && (sprite === "tree_oak" || sprite === "tree_pine" || portrayal(label) === "tree"))
        return true;
    if (asked !== "custom" && portrayal(label) === asked)
        return true;
    const stem = noun.replace(/(es|s)$/, "");
    return stem.length > 2 && `${label} ${sprite}`.toLowerCase().includes(stem);
}
export function carryColor(requests, ops) {
    const paints = requests.flatMap((request) => coloredNouns(request.text));
    if (!paints.length)
        return ops;
    return ops.map((op) => {
        if (op.op !== "place" || colorWord(op.label))
            return op;
        const hit = paints.find((paint) => sameKind(paint.noun, op.label, op.sprite));
        if (!hit)
            return op;
        return { ...op, label: `${hit.color} ${op.label}`.slice(0, 40) };
    });
}
export function supplementSky(requests, chosen, _local) {
    const wanted = skyAsk(requests);
    if (!wanted)
        return chosen;
    if (chosen.some((op) => op.op === "sky" && op.value === wanted))
        return chosen;
    const next = [];
    for (const op of chosen)
        if (op.op !== "sky")
            next.push(op);
    next.push({ op: "sky", value: wanted });
    return next.slice(0, 48);
}
function mentionedProps(requests) {
    const found = [];
    const text = requests.map((request) => request.text).join(" ");
    for (const [pattern, label] of PROPS)
        if (pattern.test(text) && !found.includes(label))
            found.push(label);
    for (const label of animalNames(text))
        if (!found.includes(label))
            found.push(label);
    return found;
}
const COUNTS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const LANDMARKS = {
    barn: ["barn", "ranch", "stable", "farmhouse", "farm"],
    ranch: ["ranch", "barn", "farm"],
    stable: ["stable", "barn", "ranch"],
    skyscraper: ["skyscraper", "tower"],
    store: ["store", "shop"],
};
function howMany(requests, label) {
    const text = requests.map((request) => request.text).join(" ");
    const numbered = text.match(/\b(\d+|one|two|three|four|five|six|seven|eight)\b/i);
    if (numbered) {
        const count = COUNTS[numbered[1].toLowerCase()] ?? Number(numbered[1]);
        if (count >= 1 && count <= 8)
            return count;
    }
    if (new RegExp(`\\b${label.toLowerCase()}s\\b|\\bcattle\\b|\\bherd\\b`, "i").test(text))
        return 3;
    return 1;
}
function named(label, expected) {
    return new RegExp(`\\b${expected}s?\\b`, "i").test(label) && label.trim().length <= expected.length + 16;
}
function landmark(requests, world) {
    const text = requests.map((request) => request.text).join(" ");
    const match = text.match(/\b(?:near|by|beside|next to|around|in front of|behind)\s+(?:the\s+)?([a-z][a-z0-9 '-]{1,32})/i);
    if (!match?.[1])
        return null;
    const phrase = match[1].toLowerCase().split(/\b(?:and|with|so|then)\b/)[0] ?? "";
    const keys = phrase.split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    const sentences = requests.map((request) => request.text.trim().replace(/\s+/g, " ").slice(0, 40).toLowerCase());
    let best = null;
    for (const entity of world.entities) {
        if (entity.sprite === "sign" && sentences.includes(entity.label.trim().toLowerCase()))
            continue;
        const hay = `${entity.label} ${entity.note ?? ""} ${entity.kind} ${entity.sprite}`.toLowerCase();
        let score = 0;
        for (const key of keys) {
            const names = LANDMARKS[key] ?? [key];
            if (names.some((name) => hay.includes(name)))
                score += names[0] === key && hay.includes(key) ? 2 : 1;
        }
        if (entity.kind === "house" || entity.kind === "tower" || entity.kind === "castle")
            score += score > 0 ? 3 : 0;
        if (score > 0 && (!best || score > best.score))
            best = { entity, score };
    }
    return best?.entity ?? null;
}
function addNear(world, ops, anchor, sprite, label, note, terrainOk) {
    const draft = applyOps(world, ops).world;
    const info = SPRITES[sprite];
    let best = null;
    for (let y = 0; y <= GRID_H - info.h; y += 1) {
        for (let x = 0; x <= GRID_W - info.w; x += 1) {
            let ground = true;
            for (let dy = 0; dy < info.h && ground; dy += 1) {
                for (let dx = 0; dx < info.w; dx += 1)
                    if (!terrainOk(draft.terrain[y + dy][x + dx]))
                        ground = false;
            }
            if (!ground)
                continue;
            const probe = {
                id: "probe",
                kind: info.kind,
                x,
                y,
                w: info.w,
                h: info.h,
                sprite,
                label,
                createdBy: "agent",
            };
            if (placementError(draft, probe))
                continue;
            const dist = Math.abs(x + info.w / 2 - (anchor.x + anchor.w / 2)) + Math.abs(y + info.h / 2 - (anchor.y + anchor.h / 2));
            if (!best || dist < best.dist)
                best = { x, y, dist };
        }
    }
    if (!best) {
        addPlace(world, ops, sprite, label, note, terrainOk);
        return;
    }
    ops.push({ op: "place", kind: info.kind, x: best.x, y: best.y, sprite, label, note, ...(sprite === "prop" ? { model: inventModel(label) } : {}) });
}
function dropSentenceSigns(world, ops, requests) {
    for (const request of requests) {
        const label = request.text.trim().replace(/\s+/g, " ").slice(0, 40);
        for (const entity of world.entities) {
            if (entity.sprite === "sign" && entity.label === label)
                ops.push({ op: "remove", id: entity.id });
        }
    }
}
export function supplementProps(requests, chosen, local) {
    const wanted = mentionedProps(requests);
    if (!wanted.length)
        return chosen;
    const extras = [];
    for (const label of wanted) {
        if (chosen.some((op) => op.op === "place" && named(op.label, label)))
            continue;
        extras.push(...local.filter((op) => op.op === "place" && named(op.label, label)));
    }
    const removes = local.filter((op) => op.op === "remove");
    if (!extras.length && removes.length === 0)
        return chosen;
    return [...removes, ...chosen, ...extras].slice(0, 48);
}
function tagsFor(text) {
    const found = new Set();
    const lower = text
        .toLowerCase()
        .replace(/\b(?:near|by|beside|next to|around|in front of|behind|across|over)\s+(?:the\s+)?[a-z0-9][a-z0-9 '-]{0,24}/g, " ");
    for (const [pattern, tag] of TAGS)
        if (pattern.test(lower))
            found.add(tag);
    return found;
}
function names(requests, predicate) {
    const found = [];
    for (const request of requests) {
        if (predicate(tagsFor(request.text)) && !found.includes(request.playerName))
            found.push(request.playerName);
    }
    return found;
}
function joinNames(list) {
    if (list.length === 0)
        return "someone";
    if (list.length === 1)
        return list[0];
    if (list.length === 2)
        return `${list[0]} and ${list[1]}`;
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}
function paintRect(ops, x, y, w, h, terrain) {
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(GRID_W, x + w);
    const bottom = Math.min(GRID_H, y + h);
    if (right <= left || bottom <= top)
        return;
    ops.push({ op: "paint", x: left, y: top, w: right - left, h: bottom - top, terrain });
}
function paintMatching(world, ops, sources, terrain) {
    const strips = [];
    for (let y = 0; y < GRID_H; y += 1) {
        let x = 0;
        while (x < GRID_W) {
            if (!sources.includes(world.terrain[y][x])) {
                x += 1;
                continue;
            }
            const start = x;
            while (x < GRID_W && sources.includes(world.terrain[y][x]))
                x += 1;
            const previous = strips.find((strip) => strip.x === start && strip.w === x - start && strip.y + strip.h === y);
            if (previous)
                previous.h += 1;
            else
                strips.push({ x: start, y, w: x - start, h: 1 });
        }
    }
    strips.sort((a, b) => b.w * b.h - a.w * a.h);
    for (const strip of strips.slice(0, 12))
        ops.push({ op: "paint", ...strip, terrain });
}
function clearFootprint(world, ops, x, y, w, h) {
    for (const entity of world.entities) {
        const hits = entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
        if (hits && !ops.some((op) => op.op === "remove" && op.id === entity.id))
            ops.push({ op: "remove", id: entity.id });
    }
}
function moatOrigin(world) {
    let open = null;
    let crowded = null;
    for (let y = 0; y <= GRID_H - 7; y += 1) {
        for (let x = 0; x <= GRID_W - 7; x += 1) {
            let score = y;
            let blocked = false;
            let overlaps = 0;
            for (const entity of world.entities) {
                const hits = entity.x < x + 7 && entity.x + entity.w > x && entity.y < y + 7 && entity.y + entity.h > y;
                if (!hits)
                    continue;
                overlaps += 1;
                if (entity.createdBy !== "agent")
                    blocked = true;
                else
                    score += 2;
            }
            if (!crowded || overlaps < crowded.overlaps)
                crowded = { x, y, overlaps };
            if (blocked)
                continue;
            if (!open || score < open.score)
                open = { x, y, score };
        }
    }
    const spot = open ?? crowded ?? { x: 0, y: 0 };
    return { x: spot.x, y: spot.y };
}
function addPlace(world, ops, sprite, label, note, terrainOk) {
    const info = SPRITES[sprite];
    const draft = applyOps(world, ops).world;
    const candidates = [];
    for (let y = 0; y <= GRID_H - info.h; y += 1) {
        for (let x = 0; x <= GRID_W - info.w; x += 1) {
            let ok = true;
            for (let dy = 0; dy < info.h && ok; dy += 1) {
                for (let dx = 0; dx < info.w; dx += 1)
                    if (!terrainOk(draft.terrain[y + dy][x + dx]))
                        ok = false;
            }
            if (!ok)
                continue;
            const probe = {
                id: "probe",
                kind: info.kind,
                x,
                y,
                w: info.w,
                h: info.h,
                sprite,
                label,
                createdBy: "agent",
            };
            if (!placementError(draft, probe))
                candidates.push({ x, y });
        }
    }
    let spot = candidates[Math.floor(candidates.length / 3)] ?? candidates[0];
    if (!spot) {
        spot = openSpot(draft, info.w, info.h, terrainOk);
        clearFootprint(world, ops, spot.x, spot.y, info.w, info.h);
        if (tilesNeedTerrain(draft, spot.x, spot.y, info.w, info.h, terrainOk)) {
            ops.push({ op: "paint", x: spot.x, y: spot.y, w: info.w, h: info.h, terrain: terrainFor(terrainOk) });
        }
    }
    ops.push({ op: "place", kind: info.kind, x: spot.x, y: spot.y, sprite, label, note, ...(sprite === "prop" ? { model: inventModel(label) } : {}) });
    return true;
}
const PLACEABLE = ["grass", "sand", "dirt", "snow", "stone", "water"];
function terrainFor(ok) {
    return PLACEABLE.find((terrain) => ok(terrain)) ?? "grass";
}
function tilesNeedTerrain(world, x, y, w, h, ok) {
    for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1)
            if (!ok(world.terrain[y + dy][x + dx]))
                return true;
    }
    return false;
}
function openSpot(world, w, h, terrainOk) {
    let best = { x: 0, y: 0, score: Number.POSITIVE_INFINITY };
    for (let y = 0; y <= GRID_H - h; y += 1) {
        for (let x = 0; x <= GRID_W - w; x += 1) {
            let overlaps = 0;
            for (const entity of world.entities) {
                const hits = entity.x < x + w && entity.x + entity.w > x && entity.y < y + h && entity.y + entity.h > y;
                if (hits)
                    overlaps += 1;
            }
            let repaint = 0;
            for (let dy = 0; dy < h; dy += 1) {
                for (let dx = 0; dx < w; dx += 1)
                    if (!terrainOk(world.terrain[y + dy][x + dx]))
                        repaint += 1;
            }
            const score = overlaps * 100 + repaint;
            if (score < best.score)
                best = { x, y, score };
        }
    }
    return { x: best.x, y: best.y };
}
const LAND = new Set(["grass", "sand", "snow", "dirt", "stone"]);
export function planBatch(world, requests) {
    const allTags = new Set();
    for (const request of requests)
        for (const tag of tagsFor(request.text))
            allTags.add(tag);
    const wantMoat = allTags.has("castle") && (allTags.has("flood") || allTags.has("river"));
    const wantShore = allTags.has("winter") && allTags.has("beach");
    const castlePeople = names(requests, (tags) => tags.has("castle"));
    const waterPeople = names(requests, (tags) => tags.has("flood") || tags.has("river"));
    const winterPeople = names(requests, (tags) => tags.has("winter"));
    const beachPeople = names(requests, (tags) => tags.has("beach"));
    const everyone = joinNames([...new Set(requests.map((request) => request.playerName))]);
    const terrainOps = [];
    const buildOps = [];
    const storyOps = [];
    const concerns = [];
    if (wantShore) {
        paintRect(terrainOps, 0, 0, GRID_W, 11, "snow");
        paintRect(terrainOps, 0, 11, GRID_W, 2, "sand");
        paintRect(terrainOps, 0, 13, GRID_W, 3, "water");
        concerns.push("Winter and a beach want the same ground, so the shore stays sand and the inland fields turn to snow.");
    }
    else {
        if (allTags.has("winter"))
            paintMatching(world, terrainOps, ["grass", "sand", "dirt"], "snow");
        if (allTags.has("desert"))
            paintMatching(world, terrainOps, ["grass", "dirt", "snow"], "sand");
        if (allTags.has("dirt"))
            paintMatching(world, terrainOps, ["grass"], "dirt");
        if (allTags.has("beach")) {
            paintRect(terrainOps, 0, 12, GRID_W, 2, "sand");
            paintRect(terrainOps, 0, 14, GRID_W, 2, "water");
        }
    }
    if (allTags.has("hill"))
        paintRect(terrainOps, 1, 1, 6, 3, "stone");
    if (!wantMoat && allTags.has("river")) {
        paintRect(terrainOps, 0, 7, GRID_W, 1, "sand");
        paintRect(terrainOps, 0, 8, GRID_W, 1, "water");
        paintRect(terrainOps, 0, 9, GRID_W, 1, "sand");
    }
    else if (!wantMoat && (allTags.has("flood") || allTags.has("lake"))) {
        paintRect(terrainOps, 3, 7, 12, 1, "sand");
        paintRect(terrainOps, 4, 8, 10, 4, "water");
    }
    const shaped = applyOps(world, terrainOps).world;
    if (wantMoat) {
        const origin = moatOrigin(world);
        concerns.push("A flood would sink the castle. The water stays in a ring.");
        clearFootprint(world, buildOps, origin.x, origin.y, 7, 7);
        paintRect(terrainOps, origin.x, origin.y, 7, 1, "water");
        paintRect(terrainOps, origin.x, origin.y + 6, 7, 1, "water");
        paintRect(terrainOps, origin.x, origin.y + 1, 1, 5, "water");
        paintRect(terrainOps, origin.x + 6, origin.y + 1, 1, 5, "water");
        paintRect(terrainOps, origin.x + 1, origin.y + 1, 5, 5, "grass");
        buildOps.push({
            op: "place",
            kind: "castle",
            x: origin.x + 2,
            y: origin.y + 2,
            sprite: "castle",
            label: "Castle",
            note: "Dry courtyard, water all around.",
        });
        buildOps.push({
            op: "place",
            kind: "bridge",
            x: origin.x + 2,
            y: origin.y + 6,
            sprite: "bridge",
            label: "Drawbridge",
            note: "The only dry crossing.",
        });
    }
    else if (allTags.has("castle")) {
        addPlace(shaped, buildOps, "castle", "Castle", "Raised on the high ground.", (terrain) => terrain !== "water");
    }
    const afterBuilds = () => applyOps(applyOps(world, terrainOps).world, buildOps).world;
    const anchor = landmark(requests, world);
    if (allTags.has("village")) {
        for (let i = 0; i < 5; i += 1) {
            addPlace(afterBuilds(), buildOps, "road", "Lane", undefined, (terrain) => LAND.has(terrain));
        }
        addPlace(afterBuilds(), buildOps, "house_small", "Cottage", "Smoke in the chimney.", (terrain) => LAND.has(terrain));
        addPlace(afterBuilds(), buildOps, "house_small", "Bakery", "The smell carries down the lane.", (terrain) => LAND.has(terrain));
        addPlace(afterBuilds(), buildOps, "well", "Well", "Cold water for the lane.", (terrain) => LAND.has(terrain));
        addPlace(afterBuilds(), storyOps, "npc_villager", "Villager", "Glad you came.", (terrain) => LAND.has(terrain));
    }
    const features = [
        ["tower", "tower", "Watchtower", "It sees past the next hill.", "build", (terrain) => terrain !== "water", 1],
        ["bridge", "bridge", "Bridge", "Planks over the water.", "build", (terrain) => terrain === "water" || terrain === "sand", 1],
        ["road", "road", "Road", "Worn by boots.", "build", (terrain) => LAND.has(terrain), 1],
        ["campfire", "campfire", "Campfire", "Someone left it burning.", "build", (terrain) => terrain !== "water", 1],
        ["boat", "boat", "Boat", "Tied, for now.", "build", (terrain) => terrain === "water", 1],
        ["flowers", "flower", "Flowers", "A bright patch.", "story", (terrain) => LAND.has(terrain), 3],
        ["knight", "npc_knight", "Knight", "On watch.", "story", (terrain) => LAND.has(terrain), 1],
        ["merchant", "npc_merchant", "Merchant", "Pack half open.", "story", (terrain) => LAND.has(terrain), 1],
        ["child", "npc_child", "Child", "Chasing something small.", "story", (terrain) => LAND.has(terrain), 1],
        ["villager", "npc_villager", "Villager", "Waving from the path.", "story", (terrain) => LAND.has(terrain), 1],
        ["cat", "animal_cat", "Cat", "Owns the step.", "story", (terrain) => LAND.has(terrain), 1],
        ["dog", "animal_dog", "Dog", "Waiting.", "story", (terrain) => LAND.has(terrain), 1],
        ["well", "well", "Well", "The rope is new.", "build", (terrain) => LAND.has(terrain), 1],
        ["forest", "tree_oak", "Oak", "Old enough to lean.", "build", (terrain) => terrain === "grass" || terrain === "snow" || terrain === "dirt", 5],
    ];
    for (const [tag, sprite, label, note, bucket, ok, count] of features) {
        if (!allTags.has(tag))
            continue;
        if (tag === "bridge" && wantMoat)
            continue;
        if (tag === "villager" && allTags.has("village"))
            continue;
        for (let i = 0; i < count; i += 1) {
            const target = bucket === "build" ? buildOps : storyOps;
            const base = applyOps(afterBuilds(), storyOps).world;
            const titled = count > 1 ? `${label} ${i + 1}` : label;
            if (anchor)
                addNear(base, target, anchor, sprite, titled, note, ok);
            else
                addPlace(base, target, sprite, titled, note, ok);
        }
    }
    if (allTags.has("sign") || wantMoat || wantShore || allTags.has("village")) {
        const note = wantMoat
            ? `${joinNames(castlePeople)} raised the castle. ${joinNames(waterPeople)} sent the water around it.`
            : wantShore
                ? `${joinNames(winterPeople)} brought the snow. ${joinNames(beachPeople)} kept the shore.`
                : `Left here by ${everyone}.`;
        addPlace(applyOps(afterBuilds(), storyOps).world, storyOps, "sign", "Sign", note, (terrain) => LAND.has(terrain));
    }
    if (allTags.has("remove")) {
        const words = requests
            .filter((request) => tagsFor(request.text).has("remove"))
            .map((request) => request.text.toLowerCase())
            .join(" ");
        for (const entity of world.entities) {
            const hay = `${entity.label} ${entity.kind} ${entity.sprite}`.toLowerCase();
            if (hay.split(/[^a-z]+/).some((word) => word.length > 2 && words.includes(word))) {
                storyOps.push({ op: "remove", id: entity.id });
            }
        }
    }
    const props = mentionedProps(requests);
    if (props.length)
        dropSentenceSigns(world, storyOps, requests);
    const ground = afterBuilds();
    for (const label of props) {
        const count = howMany(requests, label);
        for (let i = 0; i < count; i += 1) {
            if (anchor)
                addNear(ground, storyOps, anchor, "prop", label, undefined, (terrain) => LAND.has(terrain));
            else
                addPlace(ground, storyOps, "prop", label, undefined, (terrain) => LAND.has(terrain));
        }
    }
    if (terrainOps.length + buildOps.length + storyOps.length === 0) {
        for (const request of requests) {
            const text = request.text.trim().replace(/\s+/g, " ");
            const label = text.slice(0, 40) || "Note";
            addPlace(world, storyOps, "sign", label, text.slice(0, 160) || undefined, (terrain) => LAND.has(terrain));
        }
    }
    const sky = skyAsk(requests);
    const skyOps = sky ? [{ op: "sky", value: sky }] : [];
    const ops = carryColor(requests, [...skyOps, ...terrainOps, ...buildOps, ...storyOps]).slice(0, 48);
    const reply = replyFor({
        wantMoat,
        wantShore,
        castlePeople,
        waterPeople,
        winterPeople,
        beachPeople,
        everyone,
        requests,
        ops,
    });
    const lines = [
        { from: "Director", text: `Reading ${requests.length} request${requests.length === 1 ? "" : "s"} from ${everyone}.` },
        {
            from: "Architect",
            text: buildOps.length ? `Layout: ${summarize(buildOps)}.` : "No new buildings. The ground plan can stay.",
        },
        {
            from: "Naturalist",
            text: terrainOps.length ? `Land and water: ${summarize(terrainOps)}.` : "The weather and water can stay as they are.",
        },
    ];
    if (concerns[0])
        lines.push({ from: "Naturalist", text: concerns[0] });
    lines.push({
        from: "Storyteller",
        text: storyOps.length ? `Names and notes: ${summarize(storyOps)}.` : `Credit ${everyone} in the reply.`,
    });
    lines.push({ from: "Director", text: "Merging the proposals into one batch." });
    return {
        batch: {
            requestIds: requests.map((request) => request.id),
            baseVersion: world.version,
            ops,
            reply,
        },
        lines,
    };
}
function summarize(ops) {
    return ops
        .slice(0, 4)
        .map((op) => {
        if (op.op === "paint")
            return `${op.terrain}`;
        if (op.op === "place")
            return op.label;
        if (op.op === "remove")
            return "a removal";
        return "a change";
    })
        .join(", ");
}
function replyFor(input) {
    const hasCastle = input.ops.some((op) => op.op === "place" && op.sprite === "castle");
    if (input.wantMoat && hasCastle) {
        return `${joinNames(input.castlePeople)} wanted a castle and ${joinNames(input.waterPeople)} wanted the ground flooded, so the castle stands in a dry courtyard with a moat and a bridge.`;
    }
    if (input.wantShore) {
        return `${joinNames(input.winterPeople)} called winter and ${joinNames(input.beachPeople)} called the beach, so the inland fields are snow and the shore stays sand and water.`;
    }
    if (!input.ops.length) {
        return `${input.everyone} asked, so I changed the map.`;
    }
    const placed = [...new Set(input.ops.flatMap((op) => (op.op === "place" ? [op.label.replace(/ \d+$/, "")] : [])))];
    const painted = [...new Set(input.ops.flatMap((op) => (op.op === "paint" ? [op.terrain] : [])))];
    const sky = input.ops.find((op) => op.op === "sky");
    const bits = [
        placed.length ? `added ${placed.slice(0, 4).join(", ")}` : "",
        painted.length ? `painted ${painted.join(" and ")}` : "",
        sky?.op === "sky" ? `turned the sky to ${sky.value}` : "",
    ].filter(Boolean);
    const verb = input.requests.length > 1 ? "asked together" : "asked";
    return `${input.everyone} ${verb}, so I ${bits.join(" and ")}.`;
}
