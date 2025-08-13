document.addEventListener("DOMContentLoaded", () => {
  // --- FORM SUBMISSION FOR APPROVAL REGISTRATION ---
  // This part requires no changes, as it serializes the entire form.
  // The new email fields will be included automatically.
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
      const response = await fetch("/submit", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData)
      });

      const result = await response.text();

      if (response.ok) {
        resultDiv.style.display = "block";
        resultDiv.style.background = "#f0fff4";
        resultDiv.style.color = "green";
        resultDiv.innerHTML = `✅ ${result}`;
        form.reset();
      } else {
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
      submitBtn.disabled = false;
      submitBtn.textContent = "Register Approval";
      setTimeout(() => {
        resultDiv.style.display = "none";
      }, 5000);
    }
  });

  // --- EXCEL UPLOAD LOGIC (MODIFIED) ---
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
      const resultDiv = document.getElementById("dueDateResult");
    
      // Get all 5 emails from the new input fields
      const emailArray = [
          document.getElementById("excelPerformerEmail").value.trim(),
          document.getElementById("excelUnitHeadEmail").value.trim(),
          document.getElementById("excelUnitChiefEmail").value.trim(),
          document.getElementById("excelHeadEnvironmentEmail").value.trim(),
          document.getElementById("excelComplianceEmail").value.trim()
      ];

      // Validate that all fields are filled
      if(emailArray.some(email => email === '')) {
          resultDiv.innerText = "Please fill in all five email fields.";
          return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emailArray.filter(
        (email) => !emailRegex.test(email)
      );

      if (invalidEmails.length > 0) {
        resultDiv.innerText = `Invalid emails: ${invalidEmails.join(", ")}`;
        return;
      }

      if (!excelFileData) {
        resultDiv.innerText = "Please select an Excel file first.";
        return;
      }

      // The backend now expects a top-level `emails` property alongside `data`
      const payload = {
          data: excelFileData,
          emails: emailArray
      };

      try {
        const response = await fetch("/api/upload-excel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), // Send the new payload structure
        });

        const result = await response.json();

        if (result.success) {
          resultDiv.innerText = "✅ Excel file uploaded successfully!";
          excelFileData = null; // Reset file data
          document.getElementById("excelFile").value = ""; // Clear file input
          // Optionally clear email fields
          document.getElementById("excelPerformerEmail").value = "";
          document.getElementById("excelUnitHeadEmail").value = "";
          document.getElementById("excelUnitChiefEmail").value = "";
          document.getElementById("excelHeadEnvironmentEmail").value = "";
          document.getElementById("excelComplianceEmail").value = "";
        } else {
          resultDiv.innerText = "Upload failed: " + (result.message || "Unknown error");
        }
      } catch (error) {
        resultDiv.innerText = "Error: " + error.message;
      }
    });
});

// Navigation functions
function goHome() {
  window.location.href = "/";
}
function goTrack() {
  window.location.href = "/track";
}
