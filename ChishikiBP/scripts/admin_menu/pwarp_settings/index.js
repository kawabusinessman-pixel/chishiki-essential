import { system, world, ActionFormData, ModalFormData } from "../../core.js";
import { getWarpData as _getWarpData } from "../../plugins/player-warp/index.js";
function normalizeWarpName(name) {
 return String(name || "").trim().replace(/\s+/g, "_").toLowerCase()
}
function isValidWarpName(name) {
 return /^[a-zA-Z0-9_]+$/.test(name)
}
function getWarpIndex() {
 try {
 const raw = world.getDynamicProperty("pwarp_index")
 if (!raw) return []
 return JSON.parse(raw)
 } catch {
 return []
 }
}
function saveWarpIndex(arr) {
 world.setDynamicProperty("pwarp_index", JSON.stringify(arr))
}
function getWarpData(name) {
 try {
 const data = _getWarpData && typeof _getWarpData === "function" ? _getWarpData(name) : null
 if (data) return data
 } catch {}
 try {
 const raw = world.getDynamicProperty(`pwarp_${name}`)
 if (raw) return JSON.parse(raw)
 } catch {}
 return null
}
function setWarpData(name, data) {
 world.setDynamicProperty(`pwarp_${name}`, JSON.stringify(data))
}
function deleteWarpData(name) {
 world.setDynamicProperty(`pwarp_${name}`, undefined)
}
function ShowAdminPwarpSettings(admin) {
 showAdminMainMenu(admin)
}
function showAdminMainMenu(admin) {
 const idx = getWarpIndex()
 const warps = idx.map(getWarpData).filter(w => w)
 const totalWarps = warps.length
 const publicWarps = warps.filter(w => w.isPublic).length
 const privateWarps = totalWarps - publicWarps
 const form = new ActionFormData().simpleUi()
 .title("ADMIN PWARP SETTINGS")
 .body(`Manage player warps system\n\nTotal Warps: ${totalWarps} (${publicWarps} public, ${privateWarps} private)`)
 form.button("View & Manage Warps\nBrowse, edit, delete warps", "textures/ui/icon_multiplayer")
 form.button("Pwarp Settings\nConfigure limits & cooldown", "textures/ui/settings_glyph_color_2x")
 form.button("Statistics\nView detailed warp stats", "textures/ui/icon_book_writable")
 form.button("Back", "textures/ui/cancel")
 form.show(admin).then(resp => {
 if (!resp || resp.canceled) return
 switch (resp.selection) {
 case 0:
 showOwnersMenu(admin, warps)
 break
 case 1:
 showSettingsMenu(admin)
 break
 case 2:
 showStatisticsView(admin, warps)
 break
 case 3:
 break
 }
 })
}
function showOwnersMenu(admin, warps) {
 const ownersMap = new Map()
 for (const w of warps) {
 const c = ownersMap.get(w.owner) || 0
 ownersMap.set(w.owner, c + 1)
 }
 const form = new ActionFormData().simpleUi().title("VIEW & MANAGE WARPS").body("Select a group to view pwarps:\nAll warps or by owner.")
 form.button(`All Warps (${warps.length})`, "textures/ui/icon_multiplayer")
 const owners = Array.from(ownersMap.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
 owners.forEach(owner => {
 const count = ownersMap.get(owner)
 form.button(`${owner} (${count})`, "textures/ui/csb_purchase_amazondevicewarning")
 })
 form.button("Back", "textures/ui/arrow_left")
 form.show(admin).then(resp => {
 if (!resp || resp.canceled) return
 const sel = resp.selection
 if (sel === owners.length + 1) {
 showAdminMainMenu(admin)
 return
 }
 if (sel === 0) {
 showWarpsList(admin, warps, 'All Warps')
 return
 }
 const owner = owners[sel - 1]
 if (!owner) return
 const ownerWarps = warps.filter(w => w.owner === owner)
 showWarpsList(admin, ownerWarps, `Warps by ${owner}`)
 })
}
function showWarpsList(admin, warps, title = 'PWARPS') {
 const form = new ActionFormData().simpleUi().title(`ADMIN: ${title}`).body("Select warp to manage:")
 if (!warps || warps.length === 0) {
 form.button("No warps in this group", "textures/ui/icon_recipe_construction")
 } else {
 warps.forEach(w => {
 const access = w.isPublic ? "[PUBLIC]" : "[PRIVATE]"
 form.button(`${w.name}\nBy: ${w.owner} ${access}`, "textures/ui/icon_multiplayer")
 })
 }
 form.button("Back", "textures/ui/arrow_left")
 form.show(admin).then(resp => {
 if (!resp || resp.canceled) return
 const sel = resp.selection
 if (sel === (warps.length || 0)) {
 const idx = getWarpIndex()
 const all = idx.map(getWarpData).filter(w => w)
 showOwnersMenu(admin, all)
 return
 }
 if (!warps || warps.length === 0) return
 const selected = warps[sel]
 if (!selected) return
 new ActionFormData().simpleUi()
 .title("ADMIN: MANAGE WARP")
 .body(`Warp: ${selected.name}\nOwner: ${selected.owner}`)
 .button("Edit Warp\nModify name/owner/access/location", "textures/ui/editIcon")
 .button("Delete Warp\nRemove permanently", "textures/ui/trash")
 .button("Back", "textures/ui/arrow_left")
 .show(admin)
 .then(actionResp => {
 if (!actionResp || actionResp.canceled) return
 if (actionResp.selection === 0) {
 editWarpAsAdmin(admin, selected)
 } else if (actionResp.selection === 1) {
 confirmAndDeleteWarp(admin, selected)
 } else if (actionResp.selection === 2) {
 const idx = getWarpIndex()
 const all = idx.map(getWarpData).filter(w => w)
 showOwnersMenu(admin, all)
 }
 })
 })
}
function editWarpAsAdmin(admin, warp) {
 const form = new ModalFormData()
 .title("ADMIN: EDIT WARP")
 .textField("Warp Name (letters/numbers/underscore)", "Warp name...", { defaultValue: warp.name })
 .textField("Owner (player name)", "Owner...", { defaultValue: warp.owner })
 .toggle("Public access", { defaultValue: !!warp.isPublic })
 .toggle("Update location to your current position", { defaultValue: false })
 form.show(admin).then(res => {
 if (!res || res.canceled) return
 let [name, owner, isPublic, updateLoc] = res.formValues
 name = normalizeWarpName(name)
 owner = String(owner || warp.owner)
 if (!name) {
 admin.sendMessage("Warp name cannot be empty.")
 return
 }
 if (!isValidWarpName(name)) {
 admin.sendMessage("Invalid warp name. Use letters, numbers and underscore only.")
 return
 }
 if (name.length < 3 || name.length > 16) {
 admin.sendMessage("Warp name must be 3-16 characters long.")
 return
 }
 const idx = getWarpIndex()
 if (name !== warp.name && idx.includes(name)) {
 admin.sendMessage("Another warp already uses that name.")
 return
 }
 const updated = { ...warp, name, owner, isPublic: !!isPublic }
 if (updateLoc) {
 const { x, y, z } = admin.location
 const dimension = admin.dimension.id.replace("minecraft:", "")
 updated.location = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z), dimension }
 }
 if (name !== warp.name) {
 const ix = idx.indexOf(warp.name)
 if (ix !== -1) idx[ix] = name
 saveWarpIndex(idx)
 deleteWarpData(warp.name)
 }
 setWarpData(name, updated)
 admin.sendMessage(`Warp "${name}" updated.`)
 admin.runCommand("playsound random.levelup @s")
 })
}
function confirmAndDeleteWarp(admin, warp) {
 new ActionFormData().simpleUi()
 .title("CONFIRM DELETE")
 .body(`Are you sure you want to permanently delete warp: ${warp.name}?`)
 .button("Yes, delete", "textures/ui/confirm")
 .button("Cancel", "textures/ui/cancel")
 .show(admin)
 .then(resp => {
 if (!resp || resp.canceled || resp.selection === 1) return
 const idx = getWarpIndex()
 const ix = idx.indexOf(warp.name)
 if (ix !== -1) idx.splice(ix, 1)
 saveWarpIndex(idx)
 deleteWarpData(warp.name)
 admin.sendMessage(`Warp ${warp.name} removed.`)
 admin.runCommand(`playsound random.break @s`)
 })
}
function showSettingsMenu(admin) {
 const inviteCd = Number(world.getDynamicProperty("pwarp_invite_cooldown") || 30)
 const personalLimit = Number(world.getDynamicProperty("pwarp_personal_limit") || 3)
 const publicLimit = Number(world.getDynamicProperty("pwarp_public_limit") || 5)
 const form = new ModalFormData()
 .title("PWARP SETTINGS")
 .slider("Invite Cooldown (seconds)\nTime between invite sends per player", 10, 300, { defaultValue: inviteCd, valueStep: 10 })
 .slider("Personal Warp Limit\nMax private warps per player", 1, 20, { defaultValue: personalLimit, valueStep: 1 })
 .slider("Public Warp Limit\nMax public warps per player", 1, 20, { defaultValue: publicLimit, valueStep: 1 })
 form.show(admin).then(resp => {
 if (!resp || resp.canceled) {
 showAdminMainMenu(admin)
 return
 }
 const [newInviteCd, newPersonalLimit, newPublicLimit] = resp.formValues
 world.setDynamicProperty("pwarp_invite_cooldown", String(newInviteCd))
 world.setDynamicProperty("pwarp_personal_limit", String(newPersonalLimit))
 world.setDynamicProperty("pwarp_public_limit", String(newPublicLimit))
 admin.sendMessage(`Settings updated:\n- Invite Cooldown: ${newInviteCd}s\n- Personal Limit: ${newPersonalLimit}\n- Public Limit: ${newPublicLimit}`)
 admin.runCommand("playsound random.levelup @s")
 showAdminMainMenu(admin)
 })
}
function showStatisticsView(admin, warps) {
 const ownersMap = new Map()
 let totalPublic = 0
 let totalPrivate = 0
 let totalWithDesc = 0
 for (const w of warps) {
 const c = ownersMap.get(w.owner) || 0
 ownersMap.set(w.owner, c + 1)
 if (w.isPublic) totalPublic++
 else totalPrivate++
 if (w.description && w.description.trim()) totalWithDesc++
 }
 const uniqueOwners = ownersMap.size
 const avgPerOwner = uniqueOwners > 0 ? (warps.length / uniqueOwners).toFixed(1) : 0
 const topOwners = Array.from(ownersMap.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 3)
 .map(([owner, count]) => ` ${owner}: ${count} warps`)
 .join('\n')
 const body = `Total Warps: ${warps.length}
Public: ${totalPublic}
Private: ${totalPrivate}
With Description: ${totalWithDesc}
Unique Owners: ${uniqueOwners}
Avg Warps/Owner: ${avgPerOwner}
Top Owners:
${topOwners || ' None'}`
 const form = new ActionFormData().simpleUi()
 .title("PWARP STATISTICS")
 .body(body)
 .button("Refresh", "textures/ui/refresh_light")
 .button("Back", "textures/ui/arrow_left")
 form.show(admin).then(resp => {
 if (!resp || resp.canceled) {
 showAdminMainMenu(admin)
 return
 }
 if (resp.selection === 0) {
 const idx = getWarpIndex()
 const freshWarps = idx.map(getWarpData).filter(w => w)
 showStatisticsView(admin, freshWarps)
 } else {
 showAdminMainMenu(admin)
 }
 })
}
export { ShowAdminPwarpSettings }
