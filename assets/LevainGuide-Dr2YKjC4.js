const n=`/* Scoped styles for LevainGuide */
.levain-guide-container {
  font-family: 'Noto Sans JP', sans-serif;
  background: linear-gradient(135deg, #0f0c29 0%, #1a1a2e 50%, #16213e 100%);
  color: #2c2c2c;
  line-height: 1.8;
  width: 100%;
  min-height: 100vh;
  padding-bottom: 60px;
  /* Space for footer */
}

/* Header Styles */
.levain-guide-header {
  background: linear-gradient(180deg, rgba(15, 12, 41, 0.95) 0%, rgba(26, 26, 46, 0.95) 100%);
  backdrop-filter: blur(10px);
  padding: 60px 20px;
  text-align: center;
  border-bottom: 2px solid #d4af37;
  /* Removed sticky positioning */
  animation: slideDown 0.8s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-30px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.levain-guide-header h1 {
  font-family: 'Montserrat', sans-serif;
  font-size: 3.5em;
  color: #f5e6d3;
  margin-bottom: 15px;
  letter-spacing: 2px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  font-weight: 800;
  line-height: 1.2;
}

.levain-guide-header .subtitle {
  font-size: 1.3em;
  color: #d4af37;
  font-weight: 500;
  letter-spacing: 1px;
}

.levain-guide-header .divider {
  width: 80px;
  height: 2px;
  background: #d4af37;
  margin: 20px auto;
}

/* Main Content */
.levain-guide-main {
  max-width: 1100px;
  margin: 60px auto;
  padding: 0 20px;
}

.levain-section {
  background: linear-gradient(135deg, #f5e6d3 0%, #faf8f3 100%);
  border-radius: 8px;
  padding: 40px;
  margin-bottom: 40px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: fadeInUp 0.8s ease-out;
  color: #333;
  /* Ensuring text color is readable on light bg */
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.levain-section:nth-child(1) {
  animation-delay: 0.1s;
}

.levain-section:nth-child(2) {
  animation-delay: 0.2s;
}

.levain-section:nth-child(3) {
  animation-delay: 0.3s;
}

.levain-section:nth-child(4) {
  animation-delay: 0.4s;
}

.levain-section:nth-child(5) {
  animation-delay: 0.5s;
}

.levain-section:nth-child(6) {
  animation-delay: 0.6s;
}

.levain-section:nth-child(7) {
  animation-delay: 0.7s;
}

.levain-section:hover {
  transform: translateY(-5px);
  box-shadow: 0 15px 50px rgba(212, 175, 55, 0.2);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.levain-section h2 {
  font-family: 'Montserrat', sans-serif;
  font-size: 2em;
  color: #3d2817;
  margin-bottom: 25px;
  padding-bottom: 15px;
  border-bottom: 3px solid #d4af37;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
}

.levain-section h2::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 30px;
  background: #d4af37;
  border-radius: 2px;
}

.levain-section h3 {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.4em;
  color: #5a3d2e;
  margin-top: 25px;
  margin-bottom: 15px;
  font-weight: 600;
}

.levain-content {
  font-size: 1.05em;
  line-height: 2;
  color: #333;
}

/* Text Boxes */
.highlight-box {
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%);
  border-left: 5px solid #d4af37;
  padding: 20px;
  margin: 20px 0;
  border-radius: 4px;
}

.highlight-box strong {
  color: #5a3d2e;
}

.science-box {
  background: linear-gradient(135deg, rgba(63, 81, 181, 0.1) 0%, rgba(103, 58, 183, 0.1) 100%);
  border-left: 5px solid #3f51b5;
  padding: 20px;
  margin: 20px 0;
  border-radius: 4px;
  font-style: italic;
}

.warning-box {
  background: linear-gradient(135deg, rgba(255, 87, 34, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%);
  border-left: 5px solid #ff5722;
  padding: 20px;
  margin: 20px 0;
  border-radius: 4px;
}

.success-box {
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.1) 0%, rgba(139, 195, 74, 0.1) 100%);
  border-left: 5px solid #4caf50;
  padding: 20px;
  margin: 20px 0;
  border-radius: 4px;
}

.formula {
  background: #f9f9f9;
  border: 1px solid #d4af37;
  padding: 15px;
  margin: 15px 0;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #3d2817;
}

/* Steps */
.step-list {
  margin: 20px 0;
}

.step {
  margin-bottom: 18px;
  padding-left: 30px;
  position: relative;
}

.step::before {
  content: '';
  position: absolute;
  left: 0;
  top: 8px;
  width: 18px;
  height: 18px;
  background: #d4af37;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  color: #3d2817;
}

.step strong {
  color: #5a3d2e;
}

/* Tables */
.comparison-table-container {
  width: 100%;
  margin: 20px 0;
  overflow-x: auto;
}

.levain-table {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
}

.levain-table th {
  background: #5a3d2e;
  color: #f5e6d3;
  padding: 15px;
  text-align: left;
  font-weight: 600;
}

.levain-table td {
  padding: 15px;
  border-bottom: 1px solid #d4af37;
}

.levain-table tr:nth-child(even) {
  background: rgba(212, 175, 55, 0.05);
}

/* Timeline */
.timeline {
  position: relative;
  padding: 20px 0;
}

.timeline-item {
  margin-bottom: 30px;
  padding-left: 40px;
  position: relative;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 0;
  width: 12px;
  height: 12px;
  background: #d4af37;
  border-radius: 50%;
  border: 2px solid #3d2817;
}

.timeline-item::after {
  content: '';
  position: absolute;
  left: 13px;
  top: 12px;
  width: 2px;
  height: calc(100% + 18px);
  background: #d4af37;
}

.timeline-item:last-child::after {
  display: none;
}

.timeline-label {
  font-weight: 600;
  color: #5a3d2e;
  margin-bottom: 5px;
  display: block;
}

/* Footer */
.levain-footer {
  text-align: center;
  padding: 40px 20px;
  color: #f5e6d3;
  border-top: 2px solid #d4af37;
  margin-top: 80px;
  background: rgba(15, 12, 41, 0.5);
}

/* Responsive */
@media (max-width: 768px) {
  .levain-guide-header {
    padding: 40px 15px;
  }

  .levain-guide-header h1 {
    font-size: 2.2em;
  }

  .levain-section h2 {
    font-size: 1.5em;
  }

  .levain-section {
    padding: 25px;
  }

  .levain-guide-main {
    margin: 40px auto;
  }
}

/* Back Button */
.levain-back-button {
  background-color: #d4af37;
  color: #0f0c29;
  border: none;
  padding: 12px 24px;
  border-radius: 50px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  /* Centered static button */
  margin: 0 auto;
  margin-bottom: 40px;
  width: fit-content;
}

.levain-back-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}`;export{n as default};
