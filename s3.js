
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fetch from 'node-fetch';

const uuid = "17f45f43-4a6d-4e59-8c8c-7582df58fec1";

const s3 = new S3Client({ region: 'us-west-2' })

const gamed = async () => {
    try {
        const command = new PutObjectCommand({
            Bucket: "distrain-tracker",
            Key: `t${uuid}/m.json`,
        });
    
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        console.log(signedUrl);
    
        // const response = await fetch(signedUrl, {method: 'PUT', body: JSON.stringify({ hi: "gamed" })});
        // console.log(
        //     `\nResponse returned by signed URL: ${await response.text()}\n`
        //     );
    } catch (err) {
        console.error(err)
    }
}

gamed()