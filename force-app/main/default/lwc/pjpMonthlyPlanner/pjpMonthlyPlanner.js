import { LightningElement } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getMyContext from "@salesforce/apex/SfaPhaseOnePjpController.getMyContext";
import getMyBeats from "@salesforce/apex/SfaPhaseOnePjpController.getMyBeats";
import getMyPjps from "@salesforce/apex/SfaPhaseOnePjpController.getMyPjps";
import getMyApprovals from "@salesforce/apex/SfaPhaseOnePjpController.getMyApprovals";
import savePjpDraft from "@salesforce/apex/SfaPhaseOnePjpController.saveDraft";
import submitPjp from "@salesforce/apex/SfaPhaseOnePjpController.submitPjp";
import decidePjp from "@salesforce/apex/SfaPhaseOnePjpController.decidePjp";

export default class PjpMonthlyPlanner extends LightningElement {
  context;
  beats = [];
  myPjps = [];
  approvals = [];
  selectedBeatIds = [];
  rejectionReasons = {};
  startDate;
  endDate;
  draftId;
  /**
   * Initialize the planner when the component is attached to the Lightning page.
   */
  connectedCallback() {
    this.initialise();
  }
  /**
   * Load employee context, beat choices and plan lists, then initialize the editable date range.
   */
  async initialise() {
    try {
      [this.context, this.beats] = await Promise.all([getMyContext(), getMyBeats()]);
      this.setDefaultDates();
      await this.refreshLists();
    } catch (error) {
      this.showError(error);
    }
  }
  /**
   * Map beat records to the label/value choices required by the selector.
   */
  get beatOptions() {
    return this.beats.map((beat) => ({
      label: beat.Geography__r?.Name ? `${beat.Name} — ${beat.Geography__r.Name}` : beat.Name,
      value: beat.Id,
    }));
  }
  /**
   * Indicate whether the employee plan list contains rows for conditional rendering.
   */
  get hasMyPjps() {
    return this.myPjps.length > 0;
  }
  /**
   * Indicate whether the assigned-approval list contains rows for conditional rendering.
   */
  get hasApprovals() {
    return this.approvals.length > 0;
  }
  /**
   * Copy the selected start date into the unsaved plan form.
   */
  handleStart(event) {
    this.startDate = event.target.value;
  }
  /**
   * Copy the selected end date into the unsaved plan form.
   */
  handleEnd(event) {
    this.endDate = event.target.value;
  }
  /**
   * Copy selected beat IDs into the unsaved plan form.
   */
  handleBeats(event) {
    this.selectedBeatIds = event.detail.value;
  }
  /**
   * Capture the decision reason entered by the approver.
   */
  handleReason(event) {
    this.rejectionReasons = {
      ...this.rejectionReasons,
      [event.target.dataset.id]: event.target.value,
    };
  }
  /**
   * Initialize the plan date fields to the current month.
   */
  setDefaultDates() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const last = new Date(year, now.getMonth() + 1, 0).getDate();
    this.startDate = `${year}-${month}-01`;
    this.endDate = `${year}-${month}-${String(last).padStart(2, "0")}`;
  }
  /**
   * Clear the edited plan selection and restore the default planning dates.
   */
  resetForm() {
    this.draftId = null;
    this.selectedBeatIds = [];
    this.setDefaultDates();
  }
  /**
   * Send the draft plan to Apex and refresh the lists after a successful save.
   */
  async saveDraft() {
    try {
      this.draftId = await savePjpDraft({
        pjpId: this.draftId,
        startDate: this.startDate,
        endDate: this.endDate,
        beatIds: this.selectedBeatIds,
      });
      this.toast("Draft saved", "The PJP and selected Beats were saved.", "success");
      await this.refreshLists();
    } catch (error) {
      this.showError(error);
    }
  }
  /**
   * Submit the selected plan through Apex and refresh the displayed workflow status.
   */
  async submitForApproval() {
    try {
      if (!this.draftId) await this.saveDraft();
      if (!this.draftId) return;
      await submitPjp({ pjpId: this.draftId });
      this.toast("PJP submitted", `The PJP was sent to ${this.context.managerName}.`, "success");
      this.resetForm();
      await this.refreshLists();
    } catch (error) {
      this.showError(error);
    }
  }
  /**
   * Pass the selected row to the shared decision handler with an Approved outcome.
   */
  approve(event) {
    this.decide(event.target.dataset.id, true);
  }
  /**
   * Pass the selected row to the shared decision handler with a Rejected outcome.
   */
  reject(event) {
    this.decide(event.target.dataset.id, false);
  }
  /**
   * Send the selected plan decision and reason to Apex, then reload the plan and approval lists.
   */
  async decide(planId, approve) {
    try {
      await decidePjp({ pjpId: planId, approve, rejectionReason: this.rejectionReasons[planId] });
      this.toast(
        approve ? "PJP approved" : "PJP rejected",
        "The decision and audit details were saved.",
        "success",
      );
      await this.refreshLists();
    } catch (error) {
      this.showError(error);
    }
  }
  /**
   * Reload employee plans and assigned approvals from Apex.
   */
  async refreshLists() {
    const [mine, pending] = await Promise.all([getMyPjps(), getMyApprovals()]);
    this.myPjps = this.decorate(mine);
    this.approvals = this.decorate(pending);
  }
  /**
   * Add display and action-state properties to a plan row without saving it.
   */
  decorate(rows) {
    return rows.map((row) => ({
      ...row,
      beatList: row.beatNames.join(", "),
      beatCount: row.beatNames.length,
    }));
  }
  /**
   * Display a Lightning toast for the operation result.
   */
  toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
  /**
   * Convert the caught error to a user-facing error toast.
   */
  showError(error) {
    this.toast("Unable to continue", error?.body?.message || error.message, "error");
  }
}
