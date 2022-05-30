import detectEthereumProvider from "@metamask/detect-provider"
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"
import { ToastContainer, toast } from 'react-toastify'
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { providers, Contract } from "ethers"
import { useForm } from "react-hook-form"
import { TextField, Box, Button } from "@mui/material";
import Head from "next/head"
import React, { useEffect } from "react"
import styles from "../styles/Home.module.css"
import 'react-toastify/dist/ReactToastify.css'
import * as yup from 'yup';

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const { register, handleSubmit } = useForm();
    const [greetMessage, setGreetMessage] = React.useState('');
    const [formErrors, setFormErrors] = React.useState(null);

    useEffect(() => {
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const greeter = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider)
        
        greeter.on("NewGreeting", (greeting) => {
            toast.info('New Greeting');
            setGreetMessage(Buffer.from(greeting.split('0x')[1], 'hex').toString('utf-8').trim());
        });

        return () => greeter.removeAllListeners();
    }, []);

    async function greet() {
        setLogs("Creating your Semaphore identity...")

        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = "Hello world"

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof);

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    const onSubmit = (data: any) => {
        const schema = yup.object().shape({
            name: yup.string().test(
                'name-empty', 
                'Name must not be empty',
                name => name.length > 0,
            ).required(),
            age: yup.number().required().positive().integer(),
            address: yup.string().required(),
        });

        data.age = parseInt(data.age);
        schema.validate(data)
            .then(() => {
                setFormErrors(null);
                console.log(JSON.stringify(data, null, 2));
            })
            .catch((err) => {
                setFormErrors(err.errors);
            });
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <ToastContainer />

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>

                <div onClick={() => greet()} className={styles.button}>
                    Greet
                </div>
                <br />
                        <TextField 
                            color="secondary"
                            label="Greeting message"
                            variant="filled"
                            disabled
                            value={greetMessage}
                        />

                <form onSubmit={handleSubmit(onSubmit)}>
                    <Box sx={{ marginTop: 5, marginBottom: 5, color: 'white' }}>
                        <TextField 
                            color="secondary" 
                            label="Age" 
                            variant="filled" 
                            type="number" 
                            {...register("age")} 
                        />
                        <br />
                        <TextField 
                            color="secondary" 
                            label="Address" 
                            variant="filled" 
                            {...register("address")} 
                        />
                        <br />
                        <TextField 
                            color="secondary" 
                            label="Name" 
                            variant="filled" 
                            {...register("name")} 
                        />
                    </Box>
                    <Button type="submit" variant="outlined">Submit</Button>
                </form>
                { formErrors && formErrors.map((err, index) => <p key={`$erorr-${index}`}>{ formErrors }</p>) }
            </main>
        </div>
    )
}
