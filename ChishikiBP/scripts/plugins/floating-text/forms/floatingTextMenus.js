import { ActionFormData, ModalFormData, world } from "../../../core.js"
import { sortirLeaderboardMenu } from "../sortir-[vip-only].js"
import { getSortedObjectives, MONEY_DISPLAY_OPTIONS, getMoneyDisplayMode, setMoneyDisplayMode } from "../leaderboard.js"
import { floatingItemsMenu } from "../floating-item.js"
import { createRecord, deleteRecord, deleteAllRecords, setRecordText, moveRecord, getRecords, saveRecords } from "../registry.js"

const COLORS = {
 names: ["§4Dark Red§r", "§cRed§r", "§6Gold§r", "§eYellow§r", "§2Dark Green§r", "§aGreen§r", "§bAqua§r", "§3Dark Aqua§r", "§1Dark Blue§r", "§9Blue§r", "§dLight Purple§r", "§5Dark Purple§r", "§fWhite§r", "§7Gray§r", "§8Dark Gray§r", "§0Black§r"],
 codes: ["§4", "§c", "§6", "§e", "§2", "§a", "§b", "§3", "§1", "§9", "§d", "§5", "§f", "§7", "§8", "§0"],
}
const clipboard = new Map()
const fmtPos = (p, o = 0) => `${p.x.toFixed(2)} ${(p.y + o).toFixed(2)} ${p.z.toFixed(2)}`
const parsePos = (s, o = 0) => { const [x, y, z] = s.trim().split(/\s+/, 3).map(Number); if (isNaN(x) || isNaN(y) || isNaN(z)) return null; return { x, y: y + o, z } }

function locationOf(record) {
 return { x: record.x, y: record.y, z: record.z }
}

function distance(record, location) {
 return Math.hypot(record.x - location.x, record.y - location.y, record.z - location.z)
}

function typeLabel(record) {
 if (record.type === "leaderboard") return "Leaderboard"
 if (record.type === "countdown") return "Countdown"
 if (record.type === "root") return "Root"
 if (record.type === "child") return "Child"
 return "Text"
}

function getGroup(root) {
 return [root, ...getRecords().filter(record => record.parentId === root.id)].sort((a, b) => a.y - b.y)
}

function removeGroup(root) {
 for (const record of getRecords().filter(record => record.parentId === root.id)) deleteRecord(record.id)
 deleteRecord(root.id)
}

function removeNearestText(viewer) {
 const loc = viewer.location
 let nearest = null
 let best = 625
 for (const record of getRecords()) {
  if (record.dim !== viewer.dimension.id) continue
  const d = distance(record, loc)
  if (d < best) { best = d; nearest = record }
 }
 if (!nearest) return floatingTextMenu(viewer, "§cNo floating text within 25 blocks.")
 const label = (nearest.text || nearest.data?.title || "Floating Text").replace(/\n.+/g, "")
 deleteRecord(nearest.id)
 floatingTextMenu(viewer, `§aRemoved: §e${label}§r`)
}

function removeAllTexts(viewer) {
 const count = getRecords().length
 if (!count) return floatingTextMenu(viewer, "§cNo floating texts to remove.")
 deleteAllRecords()
 floatingTextMenu(viewer, `§aRemoved all §e${count}§r floating text(s).`)
}

export function toggleMoneyDisplayMode(viewer) {
 const cur = getMoneyDisplayMode()
 const newMode = cur === MONEY_DISPLAY_OPTIONS.FULL ? MONEY_DISPLAY_OPTIONS.TRUNCATED : cur === MONEY_DISPLAY_OPTIONS.TRUNCATED ? MONEY_DISPLAY_OPTIONS.STARS : MONEY_DISPLAY_OPTIONS.FULL
 setMoneyDisplayMode(newMode)
 const modeText = newMode === MONEY_DISPLAY_OPTIONS.FULL ? "§aFull (123456789)" : newMode === MONEY_DISPLAY_OPTIONS.STARS ? "§e****" : "§bTruncated (123.4M)"
 viewer.sendMessage(`§fMoney Display Mode: ${modeText}`)
 floatingTextMenu(viewer)
}

export function floatingTextMenu(viewer, error) {
 const mode = getMoneyDisplayMode()
 const moneyDisplayText = mode === MONEY_DISPLAY_OPTIONS.FULL ? "§aFull" : mode === MONEY_DISPLAY_OPTIONS.STARS ? "§e****" : "§bTruncated"
 const form = new ActionFormData()
 .title("floating text menu")
 .body(error ?? "")
 .button("new root text (stackable)", "textures/ui/anvil-plus")
 .button("new floating leaderboard", "textures/ui/book_addpicture_default")
 .button("new countdown", "textures/ui/timer")
 .button("edit loaded texts", "textures/ui/icon_book_writable")
 .button("§dmanage root \u0026 children", "textures/ui/creative_icon")
 .button("auto set leaderboard", "textures/ui/icon_bookshelf")
 .button(`money display: ${moneyDisplayText}`, "textures/ui/debug_glyph_color")
 .button("floating items settings", "textures/items/gold_ingot")
 .button("§cremove nearest text", "textures/blocks/barrier")
 .button("§cremove all texts", "textures/ui/trash_default")
 const hasClip = clipboard.has(viewer.name)
 if (hasClip) form.button(`§ePASTE: ${clipboard.get(viewer.name).type}`, "textures/ui/paste")
 form.show(viewer).then(({ selection: s, canceled }) => {
 if (canceled) return
 const actions = [createRootText, newLeaderboard, createCountdownText, showTexts, showRootManagementMenu, sortirLeaderboardMenu, toggleMoneyDisplayMode, floatingItemsMenu, removeNearestText, removeAllTexts]
 if (hasClip) actions.push(pasteText)
 actions[s]?.(viewer)
 })
}

export function newLeaderboard(viewer) {
 const sorted = getSortedObjectives(), objs = sorted.map(o => o.id), names = sorted.map(o => o.displayName)
 new ModalFormData()
 .title("new floating leaderboard")
 .textField("leaderboard title", "custom title", { defaultValue: "Leaderboard" })
 .dropdown("scoreboard objective", names, { defaultValueIndex: 0 })
 .textField("position", "x y z", { defaultValue: fmtPos(viewer.location) })
 .dropdown("scores organization", ["ascending", "descending"], { defaultValueIndex: 1 })
 .toggle("enumerate players", { defaultValue: true })
 .dropdown("enumeration color", COLORS.names, { defaultValueIndex: 2 })
 .dropdown("player name color", COLORS.names, { defaultValueIndex: 12 })
 .dropdown("score color", COLORS.names, { defaultValueIndex: 1 })
 .slider("amount of listed players", 1, 15, { defaultValue: 8, valueStep: 1 })
 .show(viewer).then(r => {
 if (r.canceled) return floatingTextMenu(viewer)
 const v = r.formValues, pos = parsePos(v[2], -0.58)
 if (!pos) { floatingTextMenu(viewer, "§cInvalid position format! Use: x y z"); return }
 createRecord({ dim: viewer.dimension.id, x: pos.x, y: pos.y, z: pos.z, type: "leaderboard", text: "LOADING...", data: [v[0], objs[v[1]], v[3], v[4], COLORS.codes[v[5]], COLORS.codes[v[6]], COLORS.codes[v[7]], v[8], {}] })
 floatingTextMenu(viewer, "§aLeaderboard created!")
 })
}

export function createCountdownText(viewer) {
 const tz = parseInt((world.getDynamicProperty("time:timezone") || "UTC+7").replace("UTC", "")) || 7
 const now = new Date(); now.setHours(now.getHours() + tz - now.getTimezoneOffset() / 60)
 const tom = new Date(now); tom.setDate(tom.getDate() + 1)
 const defDate = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, "0")}-${String(tom.getDate()).padStart(2, "0")}`
 const defTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
 new ModalFormData()
 .title("countdown text")
 .textField("title", "title", { defaultValue: "Event Countdown" })
 .textField("target date", "yyyy-mm-dd", { defaultValue: defDate })
 .textField("target time", "hh:mm", { defaultValue: defTime })
 .dropdown("format", ["days, hours, minutes, seconds", "days, hours, minutes", "hours, minutes, seconds", "hours, minutes"], { defaultValueIndex: 0 })
 .dropdown("title color", COLORS.names, { defaultValueIndex: 5 })
 .dropdown("time color", COLORS.names, { defaultValueIndex: 2 })
 .textField("text position", "x y z", { defaultValue: fmtPos(viewer.location) })
 .show(viewer).then(({ formValues: v, canceled }) => {
 if (canceled) return floatingTextMenu(viewer)
 const pos = parsePos(v[6], -0.58)
 if (!pos) { floatingTextMenu(viewer, "§cInvalid position format! Use: x y z"); return }
 try {
 const [yr, mo, dy] = (v[1] || defDate).split("-").map(Number), [hr, mn] = (v[2] || defTime).split(":").map(Number)
 const targetTime = new Date(Date.UTC(yr, mo - 1, dy, hr - tz, mn, 0)).getTime()
 if (isNaN(targetTime)) { floatingTextMenu(viewer, "§cInvalid date/time format."); return }
 createRecord({
 dim: viewer.dimension.id,
 x: pos.x,
 y: pos.y,
 z: pos.z,
 type: "countdown",
 text: `${COLORS.codes[v[4]]}${v[0] || "Event Countdown"}\n§rLoading...`,
 data: { title: v[0] || "Event Countdown", targetTime, formatIndex: v[3], titleColor: COLORS.codes[v[4]], timeColor: COLORS.codes[v[5]], created: Date.now(), timezone: tz },
 })
 floatingTextMenu(viewer, `§aCountdown created! Timezone: UTC${tz >= 0 ? "+" : ""}${tz}`)
 } catch (err) { floatingTextMenu(viewer, "§cError: " + err.message) }
 })
}

function editText(viewer, record) {
 new ModalFormData()
 .title((record.text || "Floating Text").replace(/\n.+/g, ""))
 .textField("text to display", "text", { defaultValue: (record.text || "").replace(/\n/g, "\\n") })
 .textField("text position", "x y z", { defaultValue: fmtPos(locationOf(record), 0.58) })
 .toggle("§bCOPY TEXT?§r", { defaultValue: false })
 .toggle("§cdelete?§r", { defaultValue: false })
 .show(viewer).then(r => {
 if (r.canceled) return showTexts(viewer)
 const v = r.formValues
 if (v[2]) { clipboard.set(viewer.name, { type: "text", content: record.text }); floatingTextMenu(viewer, "§aText Copied!"); return }
 if (v[3]) { deleteRecord(record.id); showTexts(viewer); return }
 const newPos = parsePos(v[1], -0.58)
 if (!newPos) { viewer.sendMessage("§cInvalid position format! Use: x y z"); showTexts(viewer); return }
 setRecordText(record.id, (v[0] || "Floating Text").replace(/\\n/g, "\n"))
 moveRecord(record.id, record.dim, newPos)
 showTexts(viewer)
 })
}

export function editLeaderboard(viewer, record) {
 const sorted = getSortedObjectives(), objs = sorted.map(o => o.id), names = sorted.map(o => o.displayName)
 const data = Array.isArray(record.data) ? record.data : ["Leaderboard", objs[0] || "money", true, true, "§6", "§f", "§a", 8, {}]
 const objIdx = objs.indexOf(data[1])
 const moneyOpts = ["Full (123456789)", "Truncated (123.4M)", "Stars (****)"]
 const curMode = getMoneyDisplayMode()
 const moneyIdx = curMode === MONEY_DISPLAY_OPTIONS.FULL ? 0 : curMode === MONEY_DISPLAY_OPTIONS.STARS ? 2 : 1
 const form = new ModalFormData()
 .title(data[0])
 .textField("title", "title", { defaultValue: data[0] })
 .dropdown("objective", names, { defaultValueIndex: Math.max(0, objIdx) })
 .textField("position", "x y z", { defaultValue: fmtPos(locationOf(record), 0.58) })
 .dropdown("organization", ["ascending", "descending"], { defaultValueIndex: data[2] ? 1 : 0 })
 .toggle("enumerate", { defaultValue: data[3] })
 .dropdown("enum color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[4])) })
 .dropdown("name color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[5])) })
 .dropdown("score color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(data[6])) })
 .slider("players", 1, 15, { defaultValue: data[7] || 8, valueStep: 1 })
 if (data[1] === "money") form.dropdown("money format", moneyOpts, { defaultValueIndex: moneyIdx })
 form.toggle("§bCOPY?§r", { defaultValue: false })
 form.toggle("§cdelete?§r", { defaultValue: false })
 form.show(viewer).then(r => {
 if (r.canceled) return showTexts(viewer)
 const v = r.formValues, copyIdx = data[1] === "money" ? 10 : 9, delIdx = data[1] === "money" ? 11 : 10
 if (v[copyIdx]) { clipboard.set(viewer.name, { type: "leaderboard", data: JSON.parse(JSON.stringify(data)) }); floatingTextMenu(viewer, "§aLeaderboard Copied!"); return }
 if (v[delIdx]) { deleteRecord(record.id); showTexts(viewer); return }
 if (objs[v[1]] === "money") {
 const mfi = data[1] === "money" ? v[9] : moneyIdx
 setMoneyDisplayMode(mfi === 0 ? MONEY_DISPLAY_OPTIONS.FULL : mfi === 2 ? MONEY_DISPLAY_OPTIONS.STARS : MONEY_DISPLAY_OPTIONS.TRUNCATED)
 }
 const newPos = parsePos(v[2], -0.58)
 if (!newPos) { floatingTextMenu(viewer, "§cInvalid position format! Use: x y z"); return }
 record.data = [v[0], objs[v[1]], v[3], v[4], COLORS.codes[v[5]], COLORS.codes[v[6]], COLORS.codes[v[7]], v[8], data[8] || {}, data[9], data[10] || {}]
 setRecordText(record.id, "LOADING...")
 moveRecord(record.id, record.dim, newPos)
 saveRecords()
 showTexts(viewer)
 })
}

export function editCountdown(viewer, record) {
 const tz = parseInt((world.getDynamicProperty("time:timezone") || "UTC+7").replace("UTC", "")) || 7
 const cd = record.data
 if (!cd) { showTexts(viewer); return }
 const td = new Date(cd.targetTime); td.setHours(td.getHours() + tz)
 const ds = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}-${String(td.getDate()).padStart(2, "0")}`
 const ts = `${String(td.getHours()).padStart(2, "0")}:${String(td.getMinutes()).padStart(2, "0")}`
 new ModalFormData()
 .title("edit countdown")
 .textField("title", "title", { defaultValue: cd.title })
 .textField("target date", "yyyy-mm-dd", { defaultValue: ds })
 .textField("target time", "hh:mm", { defaultValue: ts })
 .dropdown("format", ["days, hours, minutes, seconds", "days, hours, minutes", "hours, minutes, seconds", "hours, minutes"], { defaultValueIndex: cd.formatIndex })
 .dropdown("title color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(cd.titleColor)) })
 .dropdown("time color", COLORS.names, { defaultValueIndex: Math.max(0, COLORS.codes.indexOf(cd.timeColor)) })
 .textField("position", "x y z", { defaultValue: fmtPos(locationOf(record), 0.58) })
 .toggle("§bCOPY?§r", { defaultValue: false })
 .toggle("§cdelete?§r", { defaultValue: false })
 .show(viewer).then(({ formValues: v, canceled }) => {
 if (canceled) return showTexts(viewer)
 if (v[7]) { clipboard.set(viewer.name, { type: "countdown", data: JSON.parse(JSON.stringify(cd)) }); floatingTextMenu(viewer, "§aCountdown Copied!"); return }
 if (v[8]) { deleteRecord(record.id); showTexts(viewer); return }
 const pos = parsePos(v[6], -0.58)
 if (!pos) { showTexts(viewer); return }
 try {
 const [yr, mo, dy] = v[1].split("-").map(Number), [hr, mn] = v[2].split(":").map(Number)
 const targetTime = new Date(Date.UTC(yr, mo - 1, dy, hr - tz, mn, 0)).getTime()
 if (isNaN(targetTime)) { showTexts(viewer); return }
 record.data = { title: v[0] || "Event Countdown", targetTime, formatIndex: v[3], titleColor: COLORS.codes[v[4]], timeColor: COLORS.codes[v[5]], created: cd.created, timezone: tz }
 setRecordText(record.id, "Loading...")
 moveRecord(record.id, record.dim, pos)
 saveRecords()
 showTexts(viewer)
 } catch (err) { showTexts(viewer) }
 })
}

export function showTexts(viewer) {
 const records = getRecords()
 if (!records.length) { floatingTextMenu(viewer, "§cNo Floating Texts found."); return }
 const ui = new ActionFormData().title("edit floating texts").body("All saved TextPrimitive texts shown.")
 records.forEach(record => {
 const firstLine = (record.text || (record.type === "leaderboard" ? record.data?.[0] : record.data?.title) || "Floating Text").replace(/\n.+/g, "")
 ui.button(`${firstLine}§r\n§8[${typeLabel(record)}]`)
 })
 ui.show(viewer).then(r => {
 if (r.canceled) return floatingTextMenu(viewer)
 const record = records[r.selection]
 if (!record) return floatingTextMenu(viewer)
 if (record.type === "leaderboard") editLeaderboard(viewer, record)
 else if (record.type === "countdown") editCountdown(viewer, record)
 else if (record.type === "root") editRootText(viewer, record)
 else editTextWrapper(viewer, record)
 })
}

export function showRootManagementMenu(viewer) {
 const loc = viewer.location
 const roots = getRecords().filter(record => record.type === "root" && record.dim === viewer.dimension.id && distance(record, loc) <= 100)
 const form = new ActionFormData().title("§dManage Root & Children")
 if (!roots.length) {
 form.body("§cNo Root Entities found nearby.\n\n§7Create one from main menu!")
 form.button("§7Back")
 form.show(viewer).then(() => floatingTextMenu(viewer)); return
 }
 roots.sort((a, b) => distance(a, loc) - distance(b, loc))
 form.body("§fSelect a Root Entity:")
 for (const root of roots) {
 const cc = getRecords().filter(record => record.parentId === root.id).length
 const dist = distance(root, loc).toFixed(1)
 form.button(`§e${(root.text || "No Name").replace(/\n/g, " / ").substring(0, 35)}§r\n§7Children: §b${cc} §7| §a${dist}m`)
 }
 form.show(viewer).then(r => { if (r.canceled) floatingTextMenu(viewer); else editRootText(viewer, roots[r.selection]) })
}

function updateRootNameTag(root) {
 setRecordText(root.id, root.text || "Root Text")
 for (const child of getRecords().filter(record => record.parentId === root.id)) setRecordText(child.id, child.text || "Child Text")
}

export function createRootText(viewer) {
 new ModalFormData()
 .title("§aCreate Root Text (Unlimited)")
 .textField("Part 1 (Paste here):", "Content...", { defaultValue: "Root Text" })
 .textField("Part 2 (Optional):", "Content...", { defaultValue: "" })
 .textField("Part 3 (Optional):", "Content...", { defaultValue: "" })
 .textField("Part 4 (Optional):", "Content...", { defaultValue: "" })
 .textField("Part 5 (Optional):", "Content...", { defaultValue: "" })
 .textField("Position (X Y Z):", "x y z", { defaultValue: fmtPos(viewer.location) })
 .show(viewer).then(({ formValues: v, canceled }) => {
 if (canceled) return floatingTextMenu(viewer)
 const txt = v.slice(0, 5).join("").replace(/\\n/g, "\n")
 const pos = parsePos(v[5], -0.58)
 if (!pos) { floatingTextMenu(viewer, "§cInvalid position format! Use: x y z"); return }
 const root = createRecord({ dim: viewer.dimension.id, x: pos.x, y: pos.y, z: pos.z, type: "root", text: "" })
 applyUnlimitedText(viewer, root, txt)
 floatingTextMenu(viewer, `§aRoot created! ID: §e${root.id}`)
 })
}

function editRootText(viewer, root) {
 if (!root) return showRootManagementMenu(viewer)
 new ActionFormData()
 .title(`§eEdit Root [${root.id.substring(0, 6)}]`)
 .body(`§fEditing:\n§e${(root.text || "No Name").replace(/\n/g, " / ")}\n\n§fSelect action:`)
 .button("Change Root Content").button("§bManage Children").button("§dAdd Child Below")
 .button("Change Group Coords").button("Teleport Group to You").button("Teleport You to Root").button("§bCOPY GROUP").button("§aEDIT FULL CONTENT").button("§cDelete Entire Group")
 .show(viewer).then(r => {
 if (r.canceled) return showRootManagementMenu(viewer)
 switch (r.selection) {
 case 0: promptRenameRoot(viewer, root); break
 case 1: showChildMenu(viewer, root); break
 case 2: addChild(viewer, root); break
 case 3: changeGroupCoords(viewer, root); break
 case 4: moveGroupToPlayer(viewer, root); editRootText(viewer, root); break
 case 5: viewer.teleport(locationOf(root), { dimension: viewer.dimension }); viewer.sendMessage("§aTeleported!"); editRootText(viewer, root); break
 case 6:
 clipboard.set(viewer.name, { type: "root", rootContent: root.text, children: getGroup(root).filter(record => record.id !== root.id).map(child => ({ content: child.text, dy: child.y - root.y })) })
 floatingTextMenu(viewer, "§aGroup Copied to Clipboard!")
 break
 case 7: promptEditFullContent(viewer, root); break
 case 8: removeGroup(root); showRootManagementMenu(viewer); break
 }
 })
}

function promptEditFullContent(viewer, root) {
 const fullText = getGroup(root).reverse().map(record => record.text || "").join("\n").replace(/\n/g, "\\n")
 const CHUNK_SIZE = 3000
 const chunks = []
 for (let i = 0; i < fullText.length; i += CHUNK_SIZE) chunks.push(fullText.substring(i, i + CHUNK_SIZE))
 if (!chunks.length) chunks.push("")
 const form = new ModalFormData().title("§eEdit Full Content (Segmented)")
 chunks.forEach((chunk, i) => form.textField(`Segment ${i + 1}`, "Content...", { defaultValue: chunk }))
 const extra = 5 - chunks.length
 for (let i = 0; i < Math.max(1, extra); i++) form.textField(`New Segment ${chunks.length + i + 1}`, "Append content here...", { defaultValue: "" })
 form.show(viewer).then(r => {
 if (r.canceled) return editRootText(viewer, root)
 applyUnlimitedText(viewer, root, r.formValues.join("").replace(/\\n/g, "\n"))
 editRootText(viewer, root)
 })
}

function promptRenameRoot(viewer, root) {
 const cur = root.text || ""
 new ModalFormData().title("§eChange Root Content").textField("Content (\\n for new line)", "Root Text", { defaultValue: cur.replace(/\n/g, "\\n") })
 .show(viewer).then(r => {
 if (r.canceled) return editRootText(viewer, root)
 setRecordText(root.id, (r.formValues[0].trim() || "Root Text").replace(/\\n/g, "\n"))
 updateRootNameTag(root); editRootText(viewer, root)
 })
}

function showChildMenu(viewer, root) {
 const children = getGroup(root).filter(record => record.id !== root.id)
 const form = new ActionFormData().title("§eManage Children")
 if (!children.length) {
 form.body("§cNo children.").button("Back")
 form.show(viewer).then(() => editRootText(viewer, root)); return
 }
 form.body("§fSelect a child:")
 children.forEach((child, i) => form.button(`Child ${i + 1}: ${(child.text || "No Name").replace(/\n/g, " / ").substring(0, 40)}...`))
 form.show(viewer).then(r => { if (r.canceled) editRootText(viewer, root); else manageChild(viewer, root, children[r.selection]) })
}

function manageChild(viewer, root, child) {
 if (!child) return showChildMenu(viewer, root)
 const content = child.text || "No Name"
 new ActionFormData()
 .title("§eManage Child")
 .body(`§fSelected:\n§e${content.replace(/\n/g, " / ").substring(0, 50)}...\n\n§fAction:`)
 .button("Change Content").button("Move (Y Offset)").button("§cDelete")
 .show(viewer).then(r => {
 if (r.canceled) return showChildMenu(viewer, root)
 switch (r.selection) {
 case 0: promptRenameChild(viewer, root, child); break
 case 1: moveChild(viewer, root, child); break
 case 2: deleteRecord(child.id); updateRootNameTag(root); showChildMenu(viewer, root); break
 }
 })
}

function promptRenameChild(viewer, root, child) {
 const cur = child.text || ""
 new ModalFormData().title("§eChange Child Content").textField("Content (\\n for new line)", "Child Text", { defaultValue: cur.replace(/\n/g, "\\n") })
 .show(viewer).then(r => {
 if (r.canceled) return manageChild(viewer, root, child)
 setRecordText(child.id, (r.formValues[0].trim() || "Child Text").replace(/\\n/g, "\n"))
 updateRootNameTag(root); manageChild(viewer, root, child)
 })
}

function moveChild(viewer, root, child, err = "", last = "") {
 const curY = (child.y - root.y).toFixed(2)
 new ModalFormData().title("§eMove Child").textField(err ? `§c${err}` : "Relative Y Offset:", `Current: ${curY}`, { defaultValue: last || curY })
 .show(viewer).then(r => {
 if (r.canceled) return manageChild(viewer, root, child)
 const v = r.formValues[0].trim()
 if (/[a-zA-Z]/.test(v) || v === "") return moveChild(viewer, root, child, "Must be a number!", v)
 const n = Number(v); if (isNaN(n)) return moveChild(viewer, root, child, "Invalid number!", v)
 moveRecord(child.id, root.dim, { x: root.x, y: root.y + n, z: root.z })
 manageChild(viewer, root, child)
 })
}

function addChild(viewer, root) {
 new ModalFormData().title("§aAdd Child").textField("Content (\\n for new line):", "Child Text", { defaultValue: "Child Text" })
 .show(viewer).then(({ formValues: v, canceled }) => {
 if (canceled) return editRootText(viewer, root)
 spawnChild(viewer, root, (v[0] || "Child Text").replace(/\\n/g, "\n"))
 })
}

function spawnChild(viewer, root, txt) {
 try {
 const children = getRecords().filter(record => record.parentId === root.id).length
 createRecord({ dim: root.dim, x: root.x, y: root.y - (children + 1) * 0.27, z: root.z, type: "child", text: txt, parentId: root.id })
 updateRootNameTag(root)
 editRootText(viewer, root)
 } catch (err) { editRootText(viewer, root) }
}

function changeGroupCoords(viewer, root, err = "", last = []) {
 const [dx, dy, dz] = [last[0] ?? root.x.toFixed(2), last[1] ?? root.y.toFixed(2), last[2] ?? root.z.toFixed(2)]
 new ModalFormData().title("§eChange Group Coords")
 .textField(err ? `§c${err}` : "X", "Ex: 10", { defaultValue: dx })
 .textField("Y", "Ex: 64", { defaultValue: dy })
 .textField("Z", "Ex: -5", { defaultValue: dz })
 .show(viewer).then(r => {
 if (r.canceled) return editRootText(viewer, root)
 const [x, y, z] = r.formValues.map(value => value.trim())
 if ([x, y, z].some(value => /[a-zA-Z]/.test(value) || value === "")) return changeGroupCoords(viewer, root, "Invalid format!", [x, y, z])
 const [nx, ny, nz] = [Number(x), Number(y), Number(z)]
 if ([nx, ny, nz].some(isNaN)) return changeGroupCoords(viewer, root, "Must be numbers!", [x, y, z])
 const group = getGroup(root)
 const [dX, dY, dZ] = [nx - root.x, ny - root.y, nz - root.z]
 for (const record of group) moveRecord(record.id, root.dim, { x: record.x + dX, y: record.y + dY, z: record.z + dZ })
 editRootText(viewer, root)
 })
}

function moveGroupToPlayer(viewer, root) {
 const group = getGroup(root)
 const target = viewer.location
 const [dx, dy, dz] = [target.x - root.x, target.y - root.y, target.z - root.z]
 for (const record of group) moveRecord(record.id, root.dim, { x: record.x + dx, y: record.y + dy, z: record.z + dz })
}

function editTextWrapper(viewer, record) {
 record.type === "root" ? editRootText(viewer, record) : editText(viewer, record)
}

export { editTextWrapper as editText }

function applyUnlimitedText(viewer, root, fullText) {
 const lines = fullText.split("\n")
 const rootText = lines.shift() ?? "Root Text"
 setRecordText(root.id, rootText)
 const children = getRecords().filter(record => record.parentId === root.id).sort((a, b) => a.y - b.y).reverse()
 for (let i = 0; i < Math.max(lines.length, children.length); i++) {
 const line = lines[i]
 const child = children[i]
 if (line !== undefined && child !== undefined) {
 setRecordText(child.id, line)
 moveRecord(child.id, root.dim, { x: root.x, y: root.y - (i + 1) * 0.27, z: root.z })
 } else if (line !== undefined) {
 createRecord({ dim: root.dim, x: root.x, y: root.y - (i + 1) * 0.27, z: root.z, type: "child", text: line, parentId: root.id })
 } else if (child) {
 deleteRecord(child.id)
 }
 }
 updateRootNameTag(root)
}

function pasteText(viewer) {
 const data = clipboard.get(viewer.name)
 if (!data) return floatingTextMenu(viewer, "§cClipboard empty!")
 const pos = viewer.location
 const p = { x: pos.x, y: pos.y, z: pos.z }
 try {
 if (data.type === "root") {
 const root = createRecord({ dim: viewer.dimension.id, x: p.x, y: p.y, z: p.z, type: "root", text: data.rootContent })
 for (const child of data.children) createRecord({ dim: viewer.dimension.id, x: p.x, y: p.y + child.dy, z: p.z, type: "child", text: child.content, parentId: root.id })
 floatingTextMenu(viewer, `§aGroup Pasted! ID: §e${root.id}`)
 } else if (data.type === "text") {
 createRecord({ dim: viewer.dimension.id, x: p.x, y: p.y, z: p.z, type: "text", text: data.content })
 floatingTextMenu(viewer, "§aText Pasted!")
 } else if (data.type === "leaderboard") {
 createRecord({ dim: viewer.dimension.id, x: p.x, y: p.y, z: p.z, type: "leaderboard", text: "LOADING...", data: JSON.parse(JSON.stringify(data.data)) })
 floatingTextMenu(viewer, "§aLeaderboard Pasted!")
 } else if (data.type === "countdown") {
 createRecord({ dim: viewer.dimension.id, x: p.x, y: p.y, z: p.z, type: "countdown", text: "Loading...", data: JSON.parse(JSON.stringify(data.data)) })
 floatingTextMenu(viewer, "§aCountdown Pasted!")
 }
 } catch (e) {
 floatingTextMenu(viewer, `§cPaste Error: ${e.message}`)
 }
}
