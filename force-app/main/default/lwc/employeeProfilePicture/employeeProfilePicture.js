import { LightningElement, api } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { CloseActionScreenEvent } from "lightning/actions";

export default class EmployeeProfilePicture extends LightningElement {
  @api recordId;
  allowSingleFile = false;

  /**
   * Restrict the platform file uploader to supported JPEG and PNG image extensions.
   */
  get acceptedFormats() {
    return [".jpg", ".jpeg", ".png"];
  }

  /**
   * Acknowledge the platform uploader result with a toast and close the action; the platform has
   * already uploaded the file.
   */
  handleUploadFinished(event) {
    const uploadedFile = event.detail.files[0];
    this.dispatchEvent(
      new ShowToastEvent({
        title: "Profile picture uploaded",
        message: `${uploadedFile.name} is attached to the employee.`,
        variant: "success",
      }),
    );
    this.dispatchEvent(new CloseActionScreenEvent());
  }
}
