export const generateGuardCreatedTemplate = (details) => {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; background: #f4f4f4; }
      .container {
        max-width: 600px;
        margin: auto;
        background: #fff;
        padding: 20px;
        border-radius: 8px;
      }
      .header {
        background: #1A5E9B;
        color: #fff;
        padding: 15px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .content { padding: 20px; }
      .credentials {
        background: #f1f1f1;
        padding: 15px;
        border-radius: 6px;
        margin: 15px 0;
      }
      .btn {
        display: inline-block;
        padding: 12px 20px;
        background: #1A5E9B;
        color: #fff;
        text-decoration: none;
        border-radius: 6px;
        margin-top: 15px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>Welcome to Vigilo</h2>
      </div>
      <div class="content">
        <p>Hello <strong>${details.name}</strong>,</p>

        <p>Your guard account has been successfully created by the admin.</p>

        <div class="credentials">
          <p><strong>Email:</strong> ${details.email}</p>
          <p><strong>Mobile:</strong> ${details.mobile}</p>
          <p><strong>Temporary Password:</strong> ${details.password}</p>
          <p><strong>Address:</strong> ${details.address}</p>
        </div>

        <p>Please download the app, log in using the above credentials, and complete your profile.</p>

        <a href="${details.appLink}" class="btn">Download App</a>

        <p style="margin-top:20px;">
          For security reasons, please change your password after logging in.
        </p>

        <p>Regards,<br/>Vigilo Team</p>
      </div>
    </div>
  </body>
  </html>
  `;
};
