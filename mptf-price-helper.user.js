// ==UserScript==
// @name         MPTF Pricing Helper
// @namespace    https://steamcommunity.com/profiles/76561198967088046
// @version      1.1
// @description  Does all the job of checking and calculating prices for suggesions
// @author       eeek
// @match        https://marketplace.tf/items/tf2*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=marketplace.tf
// @updateURL https://github.com/yaboieeek/mptf-price-helper/raw/refs/heads/main/mptf-price-helper.user.js
// @downloadURL https://github.com/yaboieeek/mptf-price-helper/raw/refs/heads/main/mptf-price-helper.user.js
// @grant GM_addStyle
// ==/UserScript==

//Config. Don't change anything unless you know what you're doing
class Config {
    static validSaleMonths = 3;
    static unusualOnly = true // we check if the page is unusual. If it's not, we don't do anything here
}

//Adds prefix and that's pmuch it
class Logger {
    static LOG_PREFIX = '[MPTF_PC] '
    static log(msg) {
        if (Array.isArray(msg)) {
            return console.log(Logger.LOG_PREFIX, ...msg);
        }
        return console.log(Logger.LOG_PREFIX, msg);
    }
}

//Checks if the page is ready to perform. Basically we only need it for csrf key for requests
class PageReady {
    static async check() { 
        return new Promise((resolve, reject) => {
            const interval = setInterval(() => checkWindow(interval), 500);
            function checkWindow(check_interval) {
                if(!MPTF) {
                    Logger.log('No MPTF found!');
                    return;
                }
                if (MPTF) {
                    clearInterval(check_interval);
                    Logger.log('MPTF found!');
                    resolve(true);
                }
            }
        })
    }

    static isUnusual() {
        return window.location.pathname.includes(';5;'); //as shrimple as that
    }
}

//Requests key prices from MP API
class ApiService {
    static async keyPriceRequest(dateInText) {
        Logger.log(dateInText, );
        const url = `https://marketplace.tf/ajax/items/GetDayStats`;
        const request = await fetch("https://marketplace.tf/ajax/items/GetDayStats", {
            "credentials": "include",
            "headers": {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            "body": `sku=5021%3B6&timestamp=${dateInText}&csrf=${MPTF.csrfCode}`,
            "method": "POST",
            "mode": "cors"
        });
        if (!request.ok) throw `Something is wrong with request!`;

        const response = await request.json();
        if (!response.success) {
            throw `Failed to get key prices: ${response.message}`
        }

        return response.html
    }
}

//Creates table, fills it with relevant data. This one will call API
class UIService{
    constructor() {
        this.rows = [];
        this.ready = false;
    }

    getDatesArray() {
        let dates = Chart.instances[0].chart.config.data.labels;
        return dates
    }

    getPricesArray() {
        let prices = Chart.instances[0].chart.config.data.datasets.find(({label}) => label === 'Median Price').data;
        return prices;
    }


    createTable() {
        const dates = this.getDatesArray();
        let prices = this.getPricesArray();
        const pricesLength = prices.length;

        const relevantDates = DatesController.getMonthlyFilteredDates(dates);
        const table = document.createElement('table');
        table.className = 'eeek-table';
        const [hdate, hitemPrice, hkeyPrice, hcalcPrice, hMean] = [document.createElement('th'), document.createElement('th'),document.createElement('th'), document.createElement('th'),document.createElement('th')];

        hdate.innerText = 'Date';
        hitemPrice.innerText = 'Item price';
        hkeyPrice.innerText = 'Key price';
        hcalcPrice.innerText = 'Calculated price';
        hMean.innerText = 'Mean?';

        table.append(hdate, hitemPrice, hkeyPrice, hcalcPrice, hMean);

        for (let i = 0; i < relevantDates.length; i++) {
            const date = relevantDates[i];
            const originalIndex = dates.indexOf(date);
            if (originalIndex !== -1) {
                const price = prices[originalIndex];
                table.append(this.createTableRow(date, price));
            }
        }
        return table
    }


    createTableRow(dateString, priceString) {
        const row = document.createElement('tr');
        const [colDate, colItemPrice, colKeyPrice, colCalcPrice, colMean] = [document.createElement('td'),document.createElement('td'), document.createElement('td'), document.createElement('td'), document.createElement('td')];
        const meanCheckbox = document.createElement('input');
        meanCheckbox.type = 'checkbox';
        colMean.append(meanCheckbox);
        colMean.className = 'mean';

        colDate.innerText = dateString;
        colItemPrice.innerText = '$' + priceString;
        row.append(colDate, colItemPrice, colKeyPrice, colCalcPrice, colMean);
        this.rows.push(row);
        return row;
    }

    createPanelWithTable() {
        const itemName = document.querySelector('meta[property="og:title"]').content;
        const table = this.createTable();
        const panel = document.createElement('div');
        const panelHeading = document.createElement('div');
        const tableContainer = document.createElement('div');
        panel.className = 'panel panel-info';
        panelHeading.className = 'panel-heading';
        tableContainer.className = 'table-container';

        panelHeading.innerText = `Relevant sales for suggetions (${itemName})`;
        tableContainer.append(table);

        const keyPricesPanel = this.createButtonForKeyPrices();
        panel.append(panelHeading, tableContainer, keyPricesPanel);


        document.querySelector('#itemSalesGraphContainer').parentNode.after(panel);
    }

    createButtonForKeyPrices() {
        const button = document.createElement('button');
        const buttonPanel = document.createElement('div');

        button.className = 'btn btn-success';
        button.innerText = 'Get key prices';
        buttonPanel.className = 'eeek-button-panel'

        buttonPanel.append(button);
        button.addEventListener('click', () => this.getKeyPrices(button))
        return buttonPanel;
    }

    async getKeyPrices(button) {
        button.disabled = '';
        button.classList.add('disabled')
        if (!this.ready) {
            for (const row of this.rows) {
                await this.getKeyPriceAndModifyRow(row);
            }
            this.makeCopyAllButton();
            this.ready = true;
        }
    }

    async getKeyPriceAndModifyRow(row) {
        const meanMode = row.querySelector('td:last-child input').checked;
        const keyPrice = await this.getKeyPrice(row, meanMode);

        row.querySelectorAll('td')[2].textContent = '$' + keyPrice;

        const itemPrice = Number(row.querySelectorAll('td')[1].textContent.replace('$', ''));
        Logger.log(row.querySelector('td').textContent, keyPrice, itemPrice, itemPrice / keyPrice);
        row.querySelectorAll('td')[3].textContent = '~' + (Math.floor(itemPrice / keyPrice * 100) / 100) + ' keys';
    }

    async getKeyPrice(row, mean = false) {
        const date = row.querySelector('td').textContent;
        if (!mean) {
            const keyPriceHTML = await ApiService.keyPriceRequest(date);
            const keyPrice = Number(KeyPriceExtractor.findMostFrequentPrice(keyPriceHTML));
            return keyPrice
        }
        Logger.log(`Mean requests mode for ${date} row`);
const relevantDates = DatesController.createDatesArray(date);

let values = [];

for (let i = 0; i < relevantDates.length; i++) {
    const rDate = relevantDates[i];
    try {
        const keyPriceHTML = await ApiService.keyPriceRequest(rDate);
        const keyPrice = Number(KeyPriceExtractor.findMostFrequentPrice(keyPriceHTML));

        if (!isNaN(keyPrice) && keyPrice > 0) {
            values.push(keyPrice);
        }

        const progressPercentage = (i / (relevantDates.length - 1)) * 100;
        row.style.background = `linear-gradient(to right, #00ff401a 0%, #00ff401a ${progressPercentage}%, transparent ${progressPercentage}%, transparent 100%)`;

    } catch (error) {
        Logger.log(`Error processing date ${rDate}: ${error}`);
        values.push(0)
    }
}

        function mostFrequent(arr) {
            let m = {};
            let maxCount = 0;
            let res = null;

            for (let x of arr) {
                m[x] = (m[x] || 0) + 1;

                if (m[x] > maxCount) {
                    maxCount = m[x];
                    res = x;
                }
            }

            return res;
        }

        return mostFrequent(values.filter(val => val !== 0));
    }

    makeCopyAllButton() {
        const button = document.createElement('button');
        button.className = 'btn btn-info';
        button.addEventListener('click', () => this.copyTable());
        button.innerText = 'Copy table';
        button.style.marginRight = '1em';
        document.querySelector('.eeek-button-panel').append(button);
    }

    copyTable(button) {
        let textContent = "";
        const tableElement = document.querySelector('.eeek-table')
        const rows = tableElement.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const date = cells[0].textContent;
                const itemPrice = cells[1].textContent.replace('$', '');
                const keyPrice = cells[2].textContent.replace('$', '');
                const calculated = cells[3].textContent;

                const formattedRow = `${date}\t${itemPrice}/${keyPrice}\t${calculated}`;
                textContent += formattedRow + '\n';
            }
        });

        navigator.clipboard.writeText(textContent).then(() => {
            Logger.log('Successfully copied the table!');
        }).catch(err => {
            console.error('Error copying the table:', err);
            copyFallback(textContent);
        });
        function copyFallback(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            Logger.log('Copied via fallback');
        }

        $.snackbar({content: 'Copied the table!'});
    }
}

//Extracts key price for a date from HTML received from MP API (the most frequent sale is a base key price for this day)
class KeyPriceExtractor {
    static findMostFrequentPrice(htmlString) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const rows = doc.querySelectorAll('tbody tr');
        const priceData = Array.from(rows).map(row => {
            const priceCell = row.querySelector('td:first-child');
            const volumeCell = row.querySelector('td:last-child');

            return {
                price: parseFloat(priceCell.textContent.replace('$', '')),
                volume: parseInt(volumeCell.textContent)
            };
        });

        const maxVolume = Math.max(...priceData.map(item => item.volume));

        const mostFrequentPrices = priceData
        .filter(item => item.volume === maxVolume)
        .map(item => item.price);
        return mostFrequentPrices.length > 0 ? mostFrequentPrices[0] : null;
    }


}

class DatesController {
    static getMonthlyFilteredDates(datesArray) {
        const timenow = Math.floor(Date.now() / 1000);

        const relevantDates = datesArray.filter(dateString => {
            const UNIXString = Math.floor(new Date(dateString).getTime() / 1000);
            return (timenow - Config.validSaleMonths * 60 * 60 * 24 * 30) < UNIXString;
        })

        return relevantDates
    }

    static createDatesArray(date) {
        const currentTime = Math.floor(Date.now() / 1000);

        const dateTimestamp = Math.floor(new Date(date).getTime() / 1000);

        const dayInSeconds = 60 * 60 * 24;

        let dates = [];

        const datesAfter = [];
        const datesBefore = [];
        let beforeLength = 0;

        for (let i = dateTimestamp+dayInSeconds; i < currentTime; i+=dayInSeconds) {
            if (datesAfter.length < 3) datesAfter.push(i);

        }

        beforeLength = 3 + (3 - datesAfter.length);

        console.log(`\
            CurrentTime: ${currentTime}
            DateTimestamp: ${dateTimestamp}
            DayInSeconds: ${dayInSeconds}
            TotalPossibleDaysAfter: ${datesAfter.length}
            DaysBeforeToAdd: ${beforeLength}\
        `);

        for (let i = beforeLength; i > 0; i--) {
            datesBefore.push(dateTimestamp-dayInSeconds * i);
        }
        dates = [...datesBefore, date,...datesAfter];

        dates = dates.map(date => {
            if (isNaN(date)) return date
            const iterDate = new Date(date * 1000);

            const opt = {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            };

            return new Intl.DateTimeFormat('en-En', opt).format(iterDate)
        })
        return dates
    }
}

//Main class
class App {
    static async init() {
        if (Config.unusualOnly & !PageReady.isUnusual()) {
            return Logger.log('The page is not unusual. Ain\'t loading the script');
        }

        await PageReady.check();
        if (MPTF.csrfCode === null) return alert(`Your csrf code is null, please check if you're logged in`);
        new UIService().createPanelWithTable()
    }
}

App.init()

GM_addStyle(`
.eeek-table table,
.eeek-table th,
.eeek-table td {
  border: 1px solid black;
  text-align: center;
}

.eeek-table {
  width: 100%;
  border-radius: 3px
}
.eeek-table th,
.eeek-table td {
  border: 1px solid black;
  height: 2em
}
.eeek-table th {
    color: white;
    background-color: #2578AE;
    padding: 0.5rem 0;
}

.eeek-table td {
  width: calc(100% / 4);
}

.table-container {
    padding: 15px
}

.eeek-button-panel {
    display: flex;
    flex-direction: row-reverse;
    padding: 0 15px 15px 0;
}
.disabled {
    filter: grayscale(1.1)
}

.mean {
    width: 3rem
}
`)
