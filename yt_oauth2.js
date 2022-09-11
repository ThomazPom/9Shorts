
import fs, { cp } from 'fs'
import google from 'googleapis'
import readline from 'readline'
const OAuth2 = google.oauth2_v2.Oauth2;

const OAuth2Client = google.Common.OAuth2Client
// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/upload_app_session.json
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
];
const TOKEN_DIR =
    (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) +
    '/.credentials/';
const TOKEN_PATH = TOKEN_DIR + 'upload_app_session.json';

const authorize = (credentials, cb) => {
    const clientSecret = credentials.installed.client_secret;
    const clientId = credentials.installed.client_id;
    const redirectUrl = credentials.installed.redirect_uris[0];
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (error, token) => {
        if (error) {
            return getNewToken(oauth2Client, cb);
        } else {
            oauth2Client.credentials = JSON.parse(token);
            return cb(oauth2Client);
        }
    });
};

const getNewToken = (oauth2Client, cb) => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', code => {
        rl.close();
        oauth2Client.getToken(code, (error, token) => {
            if (error) {
                return cb(
                    new Error(
                        'Error while trying to retrieve access token',
                        error
                    )
                );
            }
            oauth2Client.credentials = token;
            storeToken(token);
            return cb(null, oauth2Client);
        });
    });
};

const storeToken = token => {
    try {
        fs.mkdirSync(TOKEN_DIR);
    } catch (error) {
        if (error.code != 'EEXIST') {
            throw error;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token), error => {
        if (error) throw error;
        console.log('Token stored to ' + TOKEN_PATH);
    });
};

export default  { authorize };