// npm init -y
// npm install minimist
// npm install axios
// npm install jsdom
// npm install excel4node
// npm install pdf-lib
// node cricinfoExtracter.js --excel=Worldcup.csv --dataDir=worldcup --source=https://www.espncricinfo.com/series/icc-cricket-world-cup-2019-1144415/match-results

let minimist = require("minimist");
let axios = require("axios");
const { JSDOM } = require("jsdom");
let jsdom = require("jsdom");
let excel4node = require("excel4node");
let pdf = require("pdf-lib");
let fs = require("fs");
let path = require("path");

// first download whole html from web
// create document to select data which we need
// selected data ko matches naam ke array me dala
// fr us array ko direct to write kr nhi skte qki vo JSO h to stringify kia then write kr dia
// convert matches to teams
// save teams to excel using excel4node
// create folders and save pdf using pdf-lib

let args = minimist(process.argv);

let dwnldKaPromise = axios.get(args.source);
dwnldKaPromise.then(function (response) {
    let html = response.data;

    let dom = new jsdom.JSDOM(html);
    let document = dom.window.document;

    let matchesDetails = document.querySelectorAll("div.match-score-block");
    let matches = [];
    for (let i = 0; i < matchesDetails.length; i++) {
        let match = {
            t1: "",
            t2: "",
            t1s: "",
            t2s: "",
            result: ""
        };
        let teamKaNaam = matchesDetails[i].querySelectorAll("div.name-detail > p.name");
        match.t1 = teamKaNaam[0].textContent;
        match.t2 = teamKaNaam[1].textContent;

        let teamKaScore = matchesDetails[i].querySelectorAll("div.score-detail > span.score")
        if (teamKaScore.length == 2) {
            match.t1s = teamKaScore[0].textContent;
            match.t2s = teamKaScore[1].textContent;
        } else if (teamKaScore.length == 1) {
            match.t1s = teamKaScore[0].textContent;
            match.t2s = "";
        } else {
            match.t1s = "";
            match.t2s = "";
        }

        let matchResult = matchesDetails[i].querySelector("div.status-text > span")
        match.result = matchResult.textContent;

        matches.push(match);
    }
    let matchJSON = JSON.stringify(matches);
    fs.writeFileSync("matches.json", matchJSON, "utf-8");

    let teams = [];
    for (let i = 0; i < matches.length; i++) {
        addTeamToTeamsArrayIfNotAlreadyThere(teams, matches[i].t1);
        addTeamToTeamsArrayIfNotAlreadyThere(teams, matches[i].t2);
    }

    for (let i = 0; i < matches.length; i++) {
        addMatchToSpecificTeam(teams, matches[i]);
    }

    let teamsJSON = JSON.stringify(teams);
    fs.writeFileSync("teams.json", teamsJSON, "utf-8");

    prepareFolderAndPdf(teams, args.dataDir);
    prepareExcel(teams, args.excel);

}).catch(function (err) {
    console.log(err);
})

function addTeamToTeamsArrayIfNotAlreadyThere(teams, teamName) {
    let tidx = -1;
    for (let i = 0; i < teams.length; i++) {
        if (teams[i].name == teamName) {
            tidx = i;
            break;
        }
    }

    if (tidx == -1) {
        teams.push({
            name: teamName,
            matches: []
        })
    }
}

function addMatchToSpecificTeam(teams, match) {
    for (let i = 0; i < teams.length; i++) {
        if (teams[i].name == match.t1) {
            teams[i].matches.push({
                vs: match.t2,
                selfScore: match.t1s,
                oppScore: match.t2s,
                result: match.result
            })
        }
    }

    for (let i = 0; i < teams.length; i++) {
        if (teams[i].name == match.t2) {
            teams[i].matches.push({
                vs: match.t1,
                selfScore: match.t2s,
                oppScore: match.t1s,
                result: match.result
            })
        }
    }
}

function prepareFolderAndPdf(teams, dataDir) {
    if (fs.existsSync(dataDir) == true) { //agr file bni hui h to delete kr dega
        fs.rmdirSync(dataDir, { recursive: true });
    }

    fs.mkdirSync(dataDir); //file create hogi

    for (let i = 0; i < teams.length; i++) {
        let teamFolderName = path.join(dataDir, teams[i].name);
        fs.mkdirSync(teamFolderName);

        for (let j = 0; j < teams[i].matches.length; j++) {
            let match = teams[i].matches[j];
            createMatchScorecardPdf(teamFolderName, teams[i].name, match);
        }
    }
}

function createMatchScorecardPdf(teamFolderName, homeTeam, match) {
    let matchFileName = path.join(teamFolderName, match.vs);

    let templateFileBytes = fs.readFileSync("Template.pdf");
    let pdfdocKaPromise = pdf.PDFDocument.load(templateFileBytes);
    pdfdocKaPromise.then(function (pdfdoc) {
        let page = pdfdoc.getPage(0);

        page.drawText(homeTeam, {
            x: 320,
            y: 703,
            size: 8
        });
        page.drawText(match.vs, {
            x: 320,
            y: 688,
            size: 8
        });
        page.drawText(match.selfScore, {
            x: 320,
            y: 673,
            size: 8
        });
        page.drawText(match.oppScore, {
            x: 320,
            y: 658,
            size: 8
        });
        page.drawText(match.result, {
            x: 320,
            y: 643,
            size: 8
        });

        let changedBytesKaPromise = pdfdoc.save();
        changedBytesKaPromise.then(function (changedBytes) {
            if (fs.existsSync(matchFileName + ".pdf") == true) {
                fs.writeFileSync(matchFileName + "1.pdf", changedBytes);
            } else {
                fs.writeFileSync(matchFileName + ".pdf", changedBytes);
            }
        })
    })
}

function prepareExcel(teams, excel){
    let wb = new excel4node.Workbook();

    for(let i=0; i<teams.length; i++){
        let sheet = wb.addWorksheet(teams[i].name);

        sheet.cell(1,1).string("Opponent");
        sheet.cell(1,2).string("Self Score");
        sheet.cell(1,3).string("Opp. Score");
        sheet.cell(1,4).string("Result");

        for(let j=0; j<teams[i].matches.length; j++){
            sheet.cell(j+2, 1).string(teams[i].matches[j].vs);
            sheet.cell(j+2, 2).string(teams[i].matches[j].selfScore);
            sheet.cell(j+2, 3).string(teams[i].matches[j].oppScore);
            sheet.cell(j+2, 4).string(teams[i].matches[j].result);
        }
    }
    wb.write(excel);
}
