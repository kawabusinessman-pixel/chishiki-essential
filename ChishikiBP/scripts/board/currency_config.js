import { system, world, ActionFormData, ModalFormData, MessageFormData } from "../core.js"
import { currencyDB, clearCurrencyCache } from "../function/getCurrency.js"
const DEFAULT_CURRENCY = {
 symbol: "$",
 name: "Dollar",
}
function getAllCurrencies() {
 const currencies = []
 const defaultCurrency = currencyDB.get("CurrencyDBConfig-default")
 if (defaultCurrency) {
 currencies.push({
 key: "CurrencyDBConfig-default",
 symbol: defaultCurrency,
 name: defaultCurrency,
 isDefault: true,
 })
 }
 for (const [key, value] of currencyDB.entries()) {
 if (key.startsWith("currency:")) {
 currencies.push({
 key,
 symbol: value.symbol,
 name: value.name,
 isDefault: false,
 })
 }
 }
 return currencies
}
export async function showCurrencyConfigForm(player) {
 let currencies = getAllCurrencies()
 let currencyNames = currencies.map(c => `${c.symbol} (${c.name})${c.isDefault ? " §7[Default]" : ""}`)
 currencyNames.push("§aAdd New Currency")
 const mainForm = new ActionFormData().title("Currency Configuration").body("Select a currency to edit or add a new one.")
 currencyNames.forEach(name => mainForm.button(name))
 const mainRes = await mainForm.show(player)
 if (mainRes.canceled) return
 if (mainRes.selection === currencies.length) {
 await showAddCurrencyForm(player)
 return
 }
 const selectedCurrency = currencies[mainRes.selection]
 await showEditCurrencyForm(player, selectedCurrency)
}
async function showAddCurrencyForm(player) {
 const form = new ModalFormData()
 .title("Add New Currency")
 .textField("Currency Symbol", "Example: $", {
 defaultValue: DEFAULT_CURRENCY.symbol,
 placeholder: "$",
 })
 .textField("Currency Name", "Example: Dollar", {
 defaultValue: DEFAULT_CURRENCY.name,
 placeholder: "Dollar",
 })
 .toggle("Set as Default", {
 defaultValue: false,
 })
 const result = await form.show(player)
 if (result.canceled) return
 const [symbol, name, setDefault] = result.formValues
 if (!symbol || !name) {
 player.sendMessage("§cCurrency symbol and name cannot be empty.")
 return
 }
 const key = `currency:${symbol}`
 currencyDB.set(key, { symbol, name, isDefault: false })
 if (setDefault) {
 currencyDB.set("CurrencyDBConfig-default", symbol)
 clearCurrencyCache("*")
 }
 player.sendMessage(`§aNew currency added: §f${symbol} (${name})${setDefault ? " §7[Default]" : ""}`)
}
async function showEditCurrencyForm(player, currency) {
 const form = new ModalFormData()
 .title("Edit Currency")
 .textField("Currency Symbol", "Example: $", {
 defaultValue: currency.symbol,
 placeholder: "$",
 })
 .textField("Currency Name", "Example: Dollar", {
 defaultValue: currency.name,
 placeholder: "Dollar",
 })
 .toggle("Set as Default", {
 defaultValue: currency.isDefault ?? false,
 })
 .toggle("Delete Currency", {
 defaultValue: false,
 })
 const result = await form.show(player)
 if (result.canceled) return
 const [symbol, name, setDefault, deleteCurrency] = result.formValues
 const key = `currency:${currency.symbol}`
 if (deleteCurrency) {
 const confirm = new MessageFormData().title("Delete Confirmation").body(`Are you sure you want to delete the currency ${currency.symbol} (${currency.name})?`).button1("§cDelete").button2("Cancel")
 const confirmRes = await confirm.show(player)
 if (confirmRes.selection === 0) {
 currencyDB.delete(key)
 clearCurrencyCache("*")
 player.sendMessage(`§cCurrency ${currency.symbol} (${currency.name}) has been deleted.`)
 }
 return
 }
 if (!symbol || !name) {
 player.sendMessage("§cCurrency symbol and name cannot be empty.")
 return
 }
 currencyDB.set(`currency:${symbol}`, { symbol, name, isDefault: false })
 if (symbol !== currency.symbol) {
 currencyDB.delete(key)
 }
 if (setDefault) {
 currencyDB.set("CurrencyDBConfig-default", symbol)
 }
 clearCurrencyCache("*")
 player.sendMessage(`§aCurrency updated: §f${symbol} (${name})${setDefault ? " §7[Default]" : ""}`)
}
