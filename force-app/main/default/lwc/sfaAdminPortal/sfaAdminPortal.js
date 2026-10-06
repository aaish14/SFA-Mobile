import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAdminDashboard from '@salesforce/apex/SfaAdminController.getAdminDashboard';

export default class SfaAdminPortal extends LightningElement {
    loading = true;
    dashboard;
    attendance = [];

    connectedCallback() { this.load(); }

    async load() {
        this.loading = true;
        try {
            const data = await getAdminDashboard();
            this.dashboard = {
                ...data,
                formattedSales: this.money(data.salesValue),
                completionRate: data.visitsPlanned ? Math.round((data.visitsCompleted / data.visitsPlanned) * 100) : 0
            };
            this.attendance = (data.attendance || []).map(row => ({
                ...row,
                loginLabel: this.dateTime(row.loginTime),
                logoutLabel: row.logoutTime ? this.dateTime(row.logoutTime) : 'Day in progress',
                loginLocation: this.location(row.loginLatitude, row.loginLongitude),
                logoutLocation: row.logoutTime ? this.location(row.logoutLatitude, row.logoutLongitude) : '—',
                loginMapUrl: this.mapUrl(row.loginLatitude, row.loginLongitude),
                logoutMapUrl: this.mapUrl(row.logoutLatitude, row.logoutLongitude),
                formattedSales: this.money(row.salesValue),
                statusClass: `status status-${(row.status || 'started').toLowerCase()}`
            }));
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Unable to load Admin portal', message: error?.body?.message || error.message, variant: 'error' }));
        } finally { this.loading = false; }
    }

    money(value) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0); }
    dateTime(value) { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
    location(lat, lng) { return lat === null || lat === undefined ? 'Location unavailable' : `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`; }
    mapUrl(lat, lng) { return lat === null || lat === undefined ? null : `https://www.google.com/maps?q=${lat},${lng}`; }
}