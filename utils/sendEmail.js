import nodemailer from "nodemailer";

const sendEmail = async (name, email, template) => {
  try{
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "ravi.quantumitinnovation@gmail.com",
      pass: "jgfzixrrjzmttcys",
    },
  });

  const mailOptions = {
    from: `"Vigilo" <ravi.quantumitinnovation@gmail.com>`,
    to: email,
    subject: `Hello ${name || "user"}`,
    text: "Hello world?",
    html: template,
  };

   const info = await transporter.sendMail(mailOptions);
    // console.log("Email sent:", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

export default sendEmail;
