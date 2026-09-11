import { system, world, Player, BlockTypes, EnchantmentType, EnchantmentTypes, ItemStack, Entity, Container, Component, ScoreboardIdentity, Dimension, Block, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, EquipmentSlot, EntityComponentTypes, ItemComponentTypes, TextPrimitive } from "@minecraft/server"
import { ActionFormData as MinecraftActionFormData, ModalFormData as MinecraftModalFormData, MessageFormData as MinecraftMessageFormData, FormCancelationReason, CustomForm, ObservableBoolean, ObservableNumber, ObservableString } from "@minecraft/server-ui"


const KIW_UI_MARKERS = Object.freeze({
  adminMenu: "§k§i§w§a§d§m§r",
  memberMenu: "§k§i§w§m§e§m§b§r",
  battlepass: "§b§p§a§s§s",
});

const KIW_ACTION_LINEAR_MARKER = "§k§l§i§n§r";
const SIMPLE_UI_MARKER = "§s§i§m§p§r";
const SHOP_MARKER = "§s§h§o§p";
const SHOP_SELL_HEADER_MARKER = "§s§h§s§l";
const SHOP_SEARCH_HEADER_MARKER = "§s§h§s§r";
const KIW_SPECIAL_LAYOUT_MARKERS = [
  KIW_ACTION_LINEAR_MARKER,
  SIMPLE_UI_MARKER,
  "§k§1§r",
  "§k§2§r",
  "§k§3§r",
  "§k§4§r",
  "§k§5§r",
  KIW_UI_MARKERS.adminMenu,
  KIW_UI_MARKERS.memberMenu,
  KIW_UI_MARKERS.battlepass,
  "§m§c§m§p",
  "§m§e§m§b",
  "§c§h§e§s§t",
  "§s§h§o§p",
  "[[",
  "[[scb_presets]]",
];

function hasKiwSpecialLayoutMarker(title) {
 return typeof title === "string" &&
 KIW_SPECIAL_LAYOUT_MARKERS.some((marker) => title.includes(marker));
}

function lowerButtonText(value) {
 if (typeof value === "string") return value.toLowerCase();
 if (Array.isArray(value)) return value.map(lowerButtonText);
 if (value && typeof value === "object") {
 const next = { ...value };
 if (typeof next.text === "string") next.text = next.text.toLowerCase();
 if (Array.isArray(next.rawtext)) next.rawtext = next.rawtext.map(lowerButtonText);
 return next;
 }
 return value;
}

function formatFormError(error) {
 return error instanceof Error ? error.message : String(error);
}

function isPlayerFormTargetValid(player) {
 try {
 if (!player) return false;
 if (typeof player.isValid === "function") return !!player.isValid();
 if (typeof player.isValid === "boolean") return player.isValid;
 return !!player.location;
 } catch {
 return false;
 }
}

function isInvalidEntityFormError(error) {
 const msg = formatFormError(error).toLowerCase();
 return (
 msg.includes("entity being invalid") ||
 msg.includes("has the entity been removed") ||
 msg.includes("entity is invalid") ||
 msg.includes("no longer valid")
 );
}

function canceledFormResponse(error, reason) {
 const response = { canceled: true, error };
 if (reason !== undefined) response.cancelationReason = reason;
 return response;
}

let lastFormErrorLogAt = 0;
let lastFormErrorKey = "";

function handleFormShowError(player, formName, error) {
 const msg = formatFormError(error);
 if (!isPlayerFormTargetValid(player) || isInvalidEntityFormError(error)) {
 return canceledFormResponse(error, "PlayerQuit");
 }

 const key = `${formName}:${msg}`;
 const now = Date.now();
 if (key !== lastFormErrorKey || now - lastFormErrorLogAt > 3000) {
 lastFormErrorKey = key;
 lastFormErrorLogAt = now;
 console.warn(`[${formName}] failed to open form: ${msg}`);
 }

 try {
 if (isPlayerFormTargetValid(player)) {
 player.sendMessage?.("§cFailed to open menu. Please try again.");
 }
 } catch {
 }

 return canceledFormResponse(error, "Error");
}

function safeShow(form, player, formName) {
 if (!isPlayerFormTargetValid(player)) {
 return Promise.resolve(canceledFormResponse(new Error("Player invalid"), "PlayerQuit"));
 }
 try {
 return form.show(player).catch((error) => handleFormShowError(player, formName, error));
 } catch (error) {
 return Promise.resolve(handleFormShowError(player, formName, error));
 }
}

function uiTitle(layout, title) {
  const text = title ?? "";
  if (layout === "adminMenu") return `${KIW_UI_MARKERS.adminMenu}§r${text}`;
  if (layout === "memberMenu") return `${KIW_UI_MARKERS.memberMenu}§r${text}`;
  return text;
}

class ActionFormData {
 constructor() {
 this._form = new MinecraftActionFormData();
 this._kiwTitleText = undefined;
 this._kiwNeedsLinearLayout = false;
 this._kiwUseSimpleUi = true;
  this._kiwSimpleUiExplicit = false;
  this._kiwUseShop = false;
  this._kiwShopSellHeader = false;
  this._kiwPreserveButtonCase = false;
 }

 title(text) {
 this._kiwTitleText = text;
 this._form.title(text);
 return this;
 }

 simpleUi() {
 this._kiwUseSimpleUi = true;
 this._kiwSimpleUiExplicit = true;
 this._kiwUseShop = false;
 return this;
 }

 gridUi() {
 this._kiwUseSimpleUi = false;
 this._kiwSimpleUiExplicit = false;
 this._kiwUseShop = false;
 return this;
 }

 layout() {
 return this;
 }

 destinationGrid() {
 return this.layout("destinationGrid");
 }

 shop() {
  this._kiwUseShop = true;
  this._kiwUseSimpleUi = false;
  this._kiwSimpleUiExplicit = false;
  return this;
 }

 shopSellHeader() {
  this._kiwShopSellHeader = true;
  return this;
 }

 shopSearchHeader() {
  this._kiwShopSearchHeader = true;
  return this;
 }

 preserveButtonCase(enabled = true) {
 this._kiwPreserveButtonCase = !!enabled;
 return this;
 }

 body(text) {
 this._form.body(text);
 return this;
 }

 button(text, iconPath) {
 const buttonText = this._kiwPreserveButtonCase ? text : lowerButtonText(text);
 if (iconPath === undefined) {
 this._form.button(buttonText);
 } else {
 this._form.button(buttonText, iconPath);
 }
 return this;
 }

 divider() {
 this._kiwNeedsLinearLayout = true;
 this._form.divider();
 return this;
 }

 header(text) {
 this._kiwNeedsLinearLayout = true;
 this._form.header(text);
 return this;
 }

 label(text) {
 this._kiwNeedsLinearLayout = true;
 this._form.label(text);
 return this;
 }

 spacer() {
 this._kiwNeedsLinearLayout = true;
 this._form.spacer();
 return this;
 }

 show(player) {
 const hasStringTitle = typeof this._kiwTitleText === "string";
  const hasSpecialLayout = hasKiwSpecialLayoutMarker(this._kiwTitleText);
  const alreadyUsesSimpleUi = hasStringTitle && this._kiwTitleText.includes(SIMPLE_UI_MARKER);
   const alreadyUsesShop = hasStringTitle && this._kiwTitleText.includes(SHOP_MARKER);
   const alreadyUsesShopSellHeader = hasStringTitle && this._kiwTitleText.includes(SHOP_SELL_HEADER_MARKER);
   const alreadyUsesShopSearchHeader = hasStringTitle && this._kiwTitleText.includes(SHOP_SEARCH_HEADER_MARKER);
   const useShopSellHeader = this._kiwUseShop && this._kiwShopSellHeader;
   const useShopSearchHeader = this._kiwUseShop && this._kiwShopSearchHeader;
 const useSimpleUi = this._kiwUseSimpleUi && (
  this._kiwSimpleUiExplicit ||
  (!this._kiwNeedsLinearLayout && !hasSpecialLayout)
   );
   if (this._kiwUseShop && hasStringTitle && (!alreadyUsesShop || (useShopSellHeader && !alreadyUsesShopSellHeader) || (useShopSearchHeader && !alreadyUsesShopSearchHeader))) {
    const sellMarker = useShopSellHeader && !alreadyUsesShopSellHeader ? SHOP_SELL_HEADER_MARKER : "";
    const searchMarker = useShopSearchHeader && !alreadyUsesShopSearchHeader ? SHOP_SEARCH_HEADER_MARKER : "";
    const shopMarkerPrefix = `${alreadyUsesShop ? "" : SHOP_MARKER}${sellMarker}${searchMarker}`;
    this._form.title(`${shopMarkerPrefix}§r${this._kiwTitleText}`);
 } else if (useSimpleUi && hasStringTitle && !alreadyUsesSimpleUi) {
  this._form.title(`${SIMPLE_UI_MARKER}${this._kiwTitleText}`);
 } else if (
 this._kiwNeedsLinearLayout &&
 hasStringTitle &&
 !hasSpecialLayout
 ) {
 this._form.title(`${KIW_ACTION_LINEAR_MARKER}${this._kiwTitleText}`);
 }
 return safeShow(this._form, player, "ActionFormData");
 }
}

class ModalFormData {
 constructor() {
 this._form = new MinecraftModalFormData();
 }

 title(...args) {
 this._form.title(...args);
 return this;
 }

 dropdown(label, items, options) {
 const normalizedOptions = typeof options === "number"
 ? { defaultValueIndex: options }
 : options;
 this._form.dropdown(label, items, normalizedOptions);
 return this;
 }

 slider(label, minimumValue, maximumValue, options, defaultValue) {
 const normalizedOptions = typeof options === "number"
 ? { valueStep: options, ...(typeof defaultValue === "number" ? { defaultValue } : {}) }
 : options;
 this._form.slider(label, minimumValue, maximumValue, normalizedOptions);
 return this;
 }

 textField(label, placeholderText, options) {
 const normalizedOptions = typeof options === "string"
 ? { defaultValue: options }
 : options;
 this._form.textField(label, placeholderText, normalizedOptions);
 return this;
 }

 toggle(label, options) {
 const normalizedOptions = typeof options === "boolean"
 ? { defaultValue: options }
 : options;
 this._form.toggle(label, normalizedOptions);
 return this;
 }

 submitButton(...args) {
 this._form.submitButton(...args);
 return this;
 }

 divider(...args) {
 this._form.divider(...args);
 return this;
 }

 header(...args) {
 this._form.header(...args);
 return this;
 }

 label(...args) {
 this._form.label(...args);
 return this;
 }

 show(player) {
 return safeShow(this._form, player, "ModalFormData");
 }
}

class MessageFormData {
 constructor() {
 this._form = new MinecraftMessageFormData();
 }

 title(...args) {
 this._form.title(...args);
 return this;
 }

 body(...args) {
 this._form.body(...args);
 return this;
 }

 button1(...args) {
 this._form.button1(...args);
 return this;
 }

 button2(...args) {
 this._form.button2(...args);
 return this;
 }

 show(player) {
 return safeShow(this._form, player, "MessageFormData");
 }
}

function destinationGridTitle(title) {
 return title ?? "";
}

function shopTitle(title) {
 const t = title ?? "";
 if (typeof t === "string" && t.includes(`${SHOP_MARKER}§r`)) return t;
 if (typeof t === "string" && t.includes(SHOP_MARKER)) return t.replace(SHOP_MARKER, `${SHOP_MARKER}§r`);
 return `${SHOP_MARKER}§r${t}`;
}

export {
 system, world, Player, Entity, BlockTypes, ItemStack, Block, Dimension, Container, Component,
 ScoreboardIdentity, ActionFormData, ModalFormData, MessageFormData, FormCancelationReason,
 CustomForm, ObservableBoolean, ObservableNumber, ObservableString, EnchantmentType, EnchantmentTypes,
 CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, EquipmentSlot,
 EntityComponentTypes, ItemComponentTypes, TextPrimitive,
 KIW_UI_MARKERS, uiTitle, destinationGridTitle, shopTitle,
 SIMPLE_UI_MARKER, SHOP_MARKER
}
