import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDashboard from '@salesforce/apex/SfaMobileController.getDashboard';
import startDay from '@salesforce/apex/SfaMobileController.startDay';
import checkIn from '@salesforce/apex/SfaMobileController.checkIn';
import completeVisit from '@salesforce/apex/SfaMobileController.completeVisit';
import markVisitMissed from '@salesforce/apex/SfaMobileController.markVisitMissed';
import saveOrder from '@salesforce/apex/SfaMobileController.saveOrder';
import endDay from '@salesforce/apex/SfaMobileController.endDay';
import saveVisitAction from '@salesforce/apex/SfaVisitActionsController.saveVisitAction';
import submitLeave from '@salesforce/apex/SfaVisitActionsController.submitLeave';

export default class SfaMobileApp extends LightningElement {
    isLoading = true;
    dayStarted = false;
    dayEnded = false;
    attendanceId;
    salesRepName = 'Sales Representative';
    beatName = 'Route not assigned';
    visits = [];
    products = [];
    schemes = [];
    activeSection = 'route';
    orderOpen = false;
    selectedVisitId;
    selectedSchemeId;
    orderLines = [];
    loginTime;
    logoutTime;
    loginLocation;
    logoutLocation;
    endDaySummary;
    actionMenuOpen = false;
    actionFormOpen = false;
    actionType;
    actionData = {};
    selectedOutletName;

    connectedCallback() {
        this.loadDashboard();
    }

    async loadDashboard() {
        this.isLoading = true;
        try {
            const dashboard = await getDashboard();
            this.salesRepName = dashboard.salesRepName;
            this.attendanceId = dashboard.attendanceId;
            this.dayStarted = Boolean(dashboard.attendanceId) && !dashboard.dayEnded;
            this.dayEnded = Boolean(dashboard.dayEnded);
            this.loginTime = this.formatDateTime(dashboard.loginTime);
            this.logoutTime = this.formatDateTime(dashboard.logoutTime);
            this.loginLocation = this.formatLocation(dashboard.loginLatitude, dashboard.loginLongitude);
            this.logoutLocation = this.formatLocation(dashboard.logoutLatitude, dashboard.logoutLongitude);
            this.endDaySummary = dashboard.endDaySummary ? {
                ...dashboard.endDaySummary,
                formattedSales: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(dashboard.endDaySummary.salesValue || 0)
            } : null;
            this.beatName = dashboard.beatName || 'Route not assigned';
            this.visits = (dashboard.visits || []).map((visit, index) => this.decorateVisit(visit, index));
            this.products = (dashboard.products || []).map(product => ({
                ...product,
                formattedPrice: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(product.price || 0)
            }));
            this.schemes = dashboard.schemes || [];
        } catch (error) {
            this.notify('Unable to load SFA data', this.messageFrom(error), 'error');
        } finally {
            this.isLoading = false;
        }
    }

    decorateVisit(visit, index) {
        return {
            ...visit,
            sequence: index + 1,
            statusClass: `status status-${(visit.status || 'Planned').toLowerCase().replace(' ', '-')}`,
            canCheckIn: visit.status === 'Planned',
            canOrder: visit.status === 'Checked In',
            canMiss: visit.status === 'Planned' || visit.status === 'Checked In'
        };
    }

    async handleStartDay() {
        await this.runAction(async () => {
            const location = await this.getCurrentLocation();
            this.attendanceId = await startDay({ latitude: location.latitude, longitude: location.longitude });
            this.notify('Day started', 'Your route data is ready.', 'success');
            await this.loadDashboard();
        });
    }

    async handleCheckIn(event) {
        const visitId = event.currentTarget.dataset.id;
        await this.runAction(async () => {
            await checkIn({ visitId });
            this.notify('Checked in', 'You can now capture the retailer order.', 'success');
            await this.loadDashboard();
        });
    }

    async handleComplete(event) {
        const visitId = event.currentTarget.dataset.id;
        await this.runAction(async () => {
            await completeVisit({ visitId });
            this.notify('Visit completed', 'Check-out time has been saved.', 'success');
            await this.loadDashboard();
        });
    }

    async openMissedDialog(event) {
        const reason = window.prompt('Why was this retailer missed?');
        if (!reason) return;
        const visitId = event.currentTarget.dataset.id;
        await this.runAction(async () => {
            await markVisitMissed({ visitId, reason });
            this.notify('Visit marked missed', 'The reason was saved for the manager.', 'info');
            await this.loadDashboard();
        });
    }

    openOrder(event) {
        this.selectedVisitId = event.currentTarget.dataset.id;
        this.orderLines = this.products.map(product => ({ productId: product.id, productName: product.name, cases: 0, pieces: 0 }));
        this.orderOpen = true;
    }

    closeOrder() {
        this.orderOpen = false;
        this.selectedVisitId = null;
        this.selectedSchemeId = null;
    }

    openActionMenu(event) {
        this.selectedVisitId = event.currentTarget.dataset.id;
        this.selectedOutletName = event.currentTarget.dataset.outlet;
        this.actionMenuOpen = true;
    }

    openStandaloneAction(event) {
        this.selectedOutletName = '';
        this.actionType = event.currentTarget.dataset.action;
        this.actionData = {};
        this.actionFormOpen = true;
    }

    selectAction(event) {
        this.actionType = event.currentTarget.dataset.action;
        this.actionData = {};
        this.actionMenuOpen = false;
        this.actionFormOpen = true;
    }

    closeAction() {
        this.actionMenuOpen = false;
        this.actionFormOpen = false;
        this.actionData = {};
    }

    updateActionField(event) {
        this.actionData = { ...this.actionData, [event.currentTarget.dataset.field]: event.detail.value };
    }

    async saveAction() {
        const fields = [...this.template.querySelectorAll('.form-stack lightning-input, .form-stack lightning-combobox, .form-stack lightning-textarea')];
        if (!fields.reduce((valid, field) => field.reportValidity() && valid, true)) return;
        await this.runAction(async () => {
            if (this.isLeave) await submitLeave({ payloadJson: JSON.stringify(this.actionData) });
            else await saveVisitAction({ actionType: this.actionType, visitId: this.selectedVisitId, payloadJson: JSON.stringify(this.actionData) });
            this.notify('Saved', `${this.actionTitle} was added successfully.`, 'success');
            this.closeAction();
        });
    }

    updateOrderLine(event) {
        const productId = event.currentTarget.dataset.id;
        const field = event.currentTarget.dataset.field;
        const value = Number(event.detail.value || 0);
        this.orderLines = this.orderLines.map(line => line.productId === productId ? { ...line, [field]: value } : line);
    }

    updateSelectedScheme(event) { this.selectedSchemeId = event.detail.value; }

    async submitOrder() {
        const selectedLines = this.orderLines.filter(line => line.cases > 0 || line.pieces > 0);
        if (!selectedLines.length) {
            this.notify('Add a quantity', 'Enter at least one case or piece.', 'warning');
            return;
        }
        await this.runAction(async () => {
            await saveOrder({ visitId: this.selectedVisitId, schemeId: this.selectedSchemeId || null, lineJson: JSON.stringify(selectedLines) });
            this.closeOrder();
            this.notify('Order saved', 'The secondary order has been sent to Salesforce.', 'success');
        });
    }

    async handleEndDay() {
        await this.runAction(async () => {
            const location = await this.getCurrentLocation();
            this.endDaySummary = await endDay({
                attendanceId: this.attendanceId,
                latitude: location.latitude,
                longitude: location.longitude
            });
            this.notify('Day ended', 'Attendance and route totals are saved.', 'success');
            await this.loadDashboard();
        });
    }

    showSection(event) { this.activeSection = event.currentTarget.dataset.section; }
    get showRoute() { return this.activeSection === 'route'; }
    get showProducts() { return this.activeSection === 'products'; }
    get showSchemes() { return this.activeSection === 'schemes'; }
    get routeTabClass() { return this.showRoute ? 'active' : ''; }
    get productsTabClass() { return this.showProducts ? 'active' : ''; }
    get schemesTabClass() { return this.showSchemes ? 'active' : ''; }
    get totalVisits() { return this.visits.length; }
    get completedVisits() { return this.visits.filter(v => v.status === 'Completed').length; }
    get remainingVisits() { return this.visits.filter(v => !['Completed', 'Missed', 'Cancelled'].includes(v.status)).length; }
    get todayLabel() { return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()); }
    get greeting() { return new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'; }
    get showStartCard() { return !this.dayStarted && !this.dayEnded; }
    get productOptions() { return this.products.map(product => ({ label: `${product.name} (${product.code})`, value: product.id })); }
    get schemeOptions() { return this.schemes.map(scheme => ({ label: scheme.name, value: scheme.id })); }
    get assetStatusOptions() { return ['Working', 'Needs Service', 'Damaged', 'Missing'].map(value => ({ label: value, value })); }
    get returnReasonOptions() { return ['Expired', 'Damaged', 'Near Expiry', 'Wrong Supply', 'Quality Issue', 'Other'].map(value => ({ label: value, value })); }
    get leaveTypeOptions() { return ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'].map(value => ({ label: value, value })); }
    get isAsset() { return this.actionType === 'asset'; }
    get isCompetitor() { return this.actionType === 'competitor'; }
    get isStock() { return this.actionType === 'stock'; }
    get isTicket() { return this.actionType === 'ticket'; }
    get isReturn() { return this.actionType === 'return'; }
    get isLeave() { return this.actionType === 'leave'; }
    get needsProduct() { return this.isStock || this.isReturn; }
    get needsDate() { return this.isAsset || this.isStock || this.isReturn || this.isLeave; }
    get acceptsImage() { return this.isAsset || this.isCompetitor || this.isTicket; }
    get dateLabel() { return this.isLeave ? 'Leave Date' : this.isAsset ? 'Given Date' : 'Manufacturing Date'; }
    get actionTitle() { return ({ asset: 'Asset Survey', competitor: 'Competitor Activity', stock: 'Stock Check', ticket: 'Raise Ticket', return: 'Product Return', leave: 'Apply Leave' })[this.actionType] || 'Visit Action'; }

    getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Location is not supported on this device.'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
                () => reject(new Error('Location permission is required to record attendance. Enable GPS and try again.')),
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
            );
        });
    }

    formatLocation(latitude, longitude) {
        if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return 'Location unavailable';
        return `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`;
    }

    formatDateTime(value) {
        if (!value) return 'Not recorded';
        return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    }

    async runAction(action) {
        this.isLoading = true;
        try { await action(); }
        catch (error) { this.notify('Action failed', this.messageFrom(error), 'error'); }
        finally { this.isLoading = false; }
    }

    messageFrom(error) { return error?.body?.message || error?.message || 'Please try again or contact your Salesforce administrator.'; }
    notify(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}