import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getMyContext from '@salesforce/apex/SfaPhaseOnePjpController.getMyContext';
import getMyBeats from '@salesforce/apex/SfaPhaseOnePjpController.getMyBeats';
import getMyPjps from '@salesforce/apex/SfaPhaseOnePjpController.getMyPjps';
import getMyApprovals from '@salesforce/apex/SfaPhaseOnePjpController.getMyApprovals';
import savePjpDraft from '@salesforce/apex/SfaPhaseOnePjpController.saveDraft';
import submitPjp from '@salesforce/apex/SfaPhaseOnePjpController.submitPjp';
import decidePjp from '@salesforce/apex/SfaPhaseOnePjpController.decidePjp';

export default class PjpMonthlyPlanner extends LightningElement {
    context; beats = []; myPjps = []; approvals = []; selectedBeatIds = [];
    rejectionReasons = {}; startDate; endDate; draftId;
    connectedCallback() { this.initialise(); }
    async initialise() {
        try {
            [this.context, this.beats] = await Promise.all([getMyContext(), getMyBeats()]);
            this.setDefaultDates(); await this.refreshLists();
        } catch (error) { this.showError(error); }
    }
    get beatOptions() { return this.beats.map(beat => ({ label: `${beat.Name} — ${beat.Geography__r?.Name || ''}`, value: beat.Id })); }
    get hasMyPjps() { return this.myPjps.length > 0; }
    get hasApprovals() { return this.approvals.length > 0; }
    handleStart(event) { this.startDate = event.target.value; }
    handleEnd(event) { this.endDate = event.target.value; }
    handleBeats(event) { this.selectedBeatIds = event.detail.value; }
    handleReason(event) { this.rejectionReasons = { ...this.rejectionReasons, [event.target.dataset.id]: event.target.value }; }
    setDefaultDates() {
        const now = new Date(); const year = now.getFullYear(); const month = String(now.getMonth() + 1).padStart(2, '0');
        const last = new Date(year, now.getMonth() + 1, 0).getDate();
        this.startDate = `${year}-${month}-01`; this.endDate = `${year}-${month}-${String(last).padStart(2, '0')}`;
    }
    resetForm() { this.draftId = null; this.selectedBeatIds = []; this.setDefaultDates(); }
    async saveDraft() {
        try {
            this.draftId = await savePjpDraft({ pjpId: this.draftId, startDate: this.startDate, endDate: this.endDate, beatIds: this.selectedBeatIds });
            this.toast('Draft saved', 'The PJP and selected Beats were saved.', 'success'); await this.refreshLists();
        } catch (error) { this.showError(error); }
    }
    async submitForApproval() {
        try {
            if (!this.draftId) await this.saveDraft(); if (!this.draftId) return;
            await submitPjp({ pjpId: this.draftId });
            this.toast('PJP submitted', `The PJP was sent to ${this.context.managerName}.`, 'success');
            this.resetForm(); await this.refreshLists();
        } catch (error) { this.showError(error); }
    }
    approve(event) { this.decide(event.target.dataset.id, true); }
    reject(event) { this.decide(event.target.dataset.id, false); }
    async decide(planId, approve) {
        try {
            await decidePjp({ pjpId: planId, approve, rejectionReason: this.rejectionReasons[planId] });
            this.toast(approve ? 'PJP approved' : 'PJP rejected', 'The decision and audit details were saved.', 'success');
            await this.refreshLists();
        } catch (error) { this.showError(error); }
    }
    async refreshLists() {
        const [mine, pending] = await Promise.all([getMyPjps(), getMyApprovals()]);
        this.myPjps = this.decorate(mine); this.approvals = this.decorate(pending);
    }
    decorate(rows) { return rows.map(row => ({ ...row, beatList: row.beatNames.join(', '), beatCount: row.beatNames.length })); }
    toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
    showError(error) { this.toast('Unable to continue', error?.body?.message || error.message, 'error'); }
}