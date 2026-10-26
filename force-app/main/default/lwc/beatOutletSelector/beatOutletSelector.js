import { LightningElement, api } from "lwc";
import { CloseActionScreenEvent } from "lightning/actions";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { notifyRecordUpdateAvailable } from "lightning/uiRecordApi";
import getSelectorData from "@salesforce/apex/BeatOutletSelectorController.getSelectorData";
import saveSelection from "@salesforce/apex/BeatOutletSelectorController.saveSelection";

export default class BeatOutletSelector extends LightningElement {
  _recordId;
  hasLoaded = false;
  isLoading = true;
  beatName = "";
  geographyName = "";
  outletOptions = [];
  selectedOutletIds = [];

  /**
   * Return the number of selected outlet IDs for the selection limit and counter.
   */
  get selectedCount() {
    return this.selectedOutletIds.length;
  }

  /**
   * Read or update the current beat record context used when loading outlet choices.
   */
  @api
  get recordId() {
    return this._recordId;
  }

  /**
   * Read or update the current beat record context used when loading outlet choices.
   */
  set recordId(value) {
    this._recordId = value;
    if (value && !this.hasLoaded) {
      this.hasLoaded = true;
      this.loadOutlets();
    }
  }

  /**
   * Fetch geography-scoped outlet options and the saved beat selection from Apex, maintaining
   * the loading and error state.
   */
  async loadOutlets() {
    this.isLoading = true;
    try {
      const data = await getSelectorData({ beatId: this.recordId });
      this.beatName = data.beatName;
      this.geographyName = data.geographyName;
      this.outletOptions = data.options.map((option) => ({
        label: option.label,
        value: option.value,
      }));
      this.selectedOutletIds = [...data.selectedOutletIds];
    } catch (error) {
      this.showToast("Unable to load outlets", this.messageFrom(error), "error");
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update the local outlet selection from the checkbox event before saving.
   */
  handleSelectionChange(event) {
    const values = event.detail.value;
    if (values.length > 10) {
      this.showToast("Maximum reached", "Select no more than 10 outlets.", "warning");
      return;
    }
    this.selectedOutletIds = [...values];
  }

  /**
   * Send selected outlet IDs to Apex, notify Lightning that the record changed, and close the
   * action after a successful save.
   */
  async saveOutlets() {
    if (this.selectedOutletIds.length > 10) {
      this.showToast("Maximum reached", "Select no more than 10 outlets.", "warning");
      return;
    }

    this.isLoading = true;
    try {
      const count = await saveSelection({
        beatId: this.recordId,
        selectedOutletIds: this.selectedOutletIds,
      });
      await notifyRecordUpdateAvailable([{ recordId: this.recordId }]);
      this.showToast("Outlets saved", `${count} outlets are assigned to this Beat.`, "success");
      this.dispatchEvent(new CloseActionScreenEvent());
    } catch (error) {
      this.showToast("Unable to save outlets", this.messageFrom(error), "error");
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Close the Lightning quick-action panel without performing a record save.
   */
  closeAction() {
    this.dispatchEvent(new CloseActionScreenEvent());
  }

  /**
   * Dispatch a Lightning toast with the supplied title, message and severity.
   */
  showToast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }

  /**
   * Extract a readable error message from the Apex or JavaScript error shape.
   */
  messageFrom(error) {
    return error?.body?.message || error?.message || "An unexpected error occurred.";
  }
}
