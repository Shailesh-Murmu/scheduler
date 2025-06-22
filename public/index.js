document.addEventListener("DOMContentLoaded", () => {
  // --- FORM SUBMISSION FOR APPROVAL REGISTRATION ---
  document.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = form.querySelector(".sub");
    const resultDiv = document.getElementById("formResult");
    

    // Convert FormData to JSON
    const jsonData = {};
    formData.forEach((value, key) => {
      jsonData[key] = value;
    });

    // Disable button during submission
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const formData = new FormData(form);
      const response = await fetch("/submit", {
        method: "POST",
        headers: {
      'Content-Type': 'application/json' // Set content type to JSON
    },
        body: JSON.stringify(jsonData) // Send as JSON string
      });

      const result = await response.text();

      if (response.ok) {
        // Show success message
        resultDiv.style.display = "block";
        resultDiv.style.background = "#f0fff4";
        resultDiv.style.color = "green";
        resultDiv.innerHTML = "✅ Approval registered successfully!";

        // Reset form
        form.reset();
      } else {
        // Show error
        resultDiv.style.display = "block";
        resultDiv.style.background = "#fff0f0";
        resultDiv.style.color = "red";
        resultDiv.textContent = `❌ Error: ${result}`;
      }
    } catch (error) {
      resultDiv.style.display = "block";
      resultDiv.style.background = "#fff0f0";
      resultDiv.style.color = "red";
      resultDiv.textContent = `❌ Network error: ${error.message}`;
    } finally {
      // Reset button
      submitBtn.disabled = false;
      submitBtn.textContent = "Register Approval";

      // Auto-hide message after 5 seconds
      setTimeout(() => {
        resultDiv.style.display = "none";
      }, 5000);
    }
  });

  // --- EXCEL UPLOAD LOGIC ---
  let excelFileData = null;

  document.getElementById("excelFile").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      excelFileData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      });
      document.getElementById("dueDateResult").innerText =
        "File ready to upload.";
    };
    reader.readAsArrayBuffer(file);
  });

  document
    .getElementById("uploadExcelBtn")
    .addEventListener("click", async function () {
      const notificationEmails =
        document.getElementById("notificationEmail").value;
      const emailArray = notificationEmails
        .split(",")
        .map((email) => email.trim())
        .filter((email) => email.length > 0);

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emailArray.filter(
        (email) => !emailRegex.test(email)
      );

      if (invalidEmails.length > 0) {
        document.getElementById(
          "dueDateResult"
        ).innerText = `Invalid emails: ${invalidEmails.join(", ")}`;
        return;
      }

      if (!excelFileData) {
        document.getElementById("dueDateResult").innerText =
          "Please select an Excel file first.";
        return;
      }

      const dataWithEmails = excelFileData.map((record) => ({
        ...record,
        emails: emailArray,
      }));

      try {
        const response = await fetch("/api/upload-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: dataWithEmails }),
        });

        const result = await response.json();

        if (result.success) {
          document.getElementById("dueDateResult").innerText =
            "✅ Excel file uploaded successfully!";
          excelFileData = null; // Reset file data
          document.getElementById("excelFile").value = ""; // Clear file input
        } else {
          document.getElementById("dueDateResult").innerText =
            "Upload failed: " + (result.message || "Unknown error");
        }
      } catch (error) {
        document.getElementById("dueDateResult").innerText =
          "Error: " + error.message;
      }
    });
});

// Navigation functions (keep outside DOMContentLoaded if used globally)
function goHome() {
  window.location.href = "/";
}
function goTrack() {
  window.location.href = "/track";
}
