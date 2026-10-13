package com.ssafy.b204.chain.contract;

import io.reactivex.Flowable;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import org.web3j.abi.EventEncoder;
import org.web3j.abi.TypeReference;
import org.web3j.abi.datatypes.Address;
import org.web3j.abi.datatypes.Array;
import org.web3j.abi.datatypes.Bool;
import org.web3j.abi.datatypes.DynamicArray;
import org.web3j.abi.datatypes.Event;
import org.web3j.abi.datatypes.Function;
import org.web3j.abi.datatypes.Type;
import org.web3j.abi.datatypes.generated.Bytes32;
import org.web3j.abi.datatypes.generated.Uint16;
import org.web3j.abi.datatypes.generated.Uint256;
import org.web3j.abi.datatypes.generated.Uint8;
import org.web3j.crypto.Credentials;
import org.web3j.protocol.Web3j;
import org.web3j.protocol.core.DefaultBlockParameter;
import org.web3j.protocol.core.RemoteFunctionCall;
import org.web3j.protocol.core.methods.request.EthFilter;
import org.web3j.protocol.core.methods.response.BaseEventResponse;
import org.web3j.protocol.core.methods.response.Log;
import org.web3j.protocol.core.methods.response.TransactionReceipt;
import org.web3j.tuples.generated.Tuple3;
import org.web3j.tuples.generated.Tuple5;
import org.web3j.tx.Contract;
import org.web3j.tx.TransactionManager;
import org.web3j.tx.gas.ContractGasProvider;

/**
 * <p>Auto generated code.
 * <p><strong>Do not modify!</strong>
 * <p>Please use the <a href="https://docs.web3j.io/command_line.html">web3j command line tools</a>,
 * or the org.web3j.codegen.SolidityFunctionWrapperGenerator in the 
 * <a href="https://github.com/web3j/web3j/tree/master/codegen">codegen module</a> to update.
 *
 * <p>Generated with web3j version 4.9.8.
 */
@SuppressWarnings("rawtypes")
public class RevenueSplitter extends Contract {
    public static final String BINARY = "Bin file was not provided";

    public static final String FUNC_BP = "BP";

    public static final String FUNC_DEFAULT_ADMIN_ROLE = "DEFAULT_ADMIN_ROLE";

    public static final String FUNC_MAX_QUANTITY_PER_ORDER = "MAX_QUANTITY_PER_ORDER";

    public static final String FUNC_MAX_TEAMS = "MAX_TEAMS";

    public static final String FUNC_OPERATOR_ROLE = "OPERATOR_ROLE";

    public static final String FUNC_AGGREGATE = "aggregate";

    public static final String FUNC_AGREETORULES = "agreeToRules";

    public static final String FUNC_AGREEDCOUNTOF = "agreedCountOf";

    public static final String FUNC_AGREEDOF = "agreedOf";

    public static final String FUNC_CHOICECOUNTOF = "choiceCountOf";

    public static final String FUNC_CHOICECOUNTSOF = "choiceCountsOf";

    public static final String FUNC_CREATESHOW = "createShow";

    public static final String FUNC_DEPOSIT = "deposit";

    public static final String FUNC_DEPOSITAMOUNTOF = "depositAmountOf";

    public static final String FUNC_DEPOSITOF = "depositOf";

    public static final String FUNC_ESCROWOF = "escrowOf";

    public static final String FUNC_FORFEITDEPOSIT = "forfeitDeposit";

    public static final String FUNC_GETROLEADMIN = "getRoleAdmin";

    public static final String FUNC_GRANTROLE = "grantRole";

    public static final String FUNC_HALT = "halt";

    public static final String FUNC_HASROLE = "hasRole";

    public static final String FUNC_HOSTTEAMINDEXOF = "hostTeamIndexOf";

    public static final String FUNC_LOCK = "lock";

    public static final String FUNC_OPERATOR = "operator";

    public static final String FUNC_PAYOUTOF = "payoutOf";

    public static final String FUNC_PAYOUTSOF = "payoutsOf";

    public static final String FUNC_PURCHASE = "purchase";

    public static final String FUNC_PURCHASEOF = "purchaseOf";

    public static final String FUNC_REFUND = "refund";

    public static final String FUNC_RELEASE = "release";

    public static final String FUNC_RENOUNCEROLE = "renounceRole";

    public static final String FUNC_RETURNDEPOSIT = "returnDeposit";

    public static final String FUNC_REVOKEROLE = "revokeRole";

    public static final String FUNC_ROTATEOPERATOR = "rotateOperator";

    public static final String FUNC_RULESHASHOF = "rulesHashOf";

    public static final String FUNC_RULESOF = "rulesOf";

    public static final String FUNC_STAGEOF = "stageOf";

    public static final String FUNC_STARTSALE = "startSale";

    public static final String FUNC_SUPPORTSINTERFACE = "supportsInterface";

    public static final String FUNC_TEAMCOUNTOF = "teamCountOf";

    public static final String FUNC_TEAMWALLETSOF = "teamWalletsOf";

    public static final String FUNC_TOKEN = "token";

    public static final String FUNC_TOTALCHOICESOF = "totalChoicesOf";

    public static final String FUNC_UPDATERULES = "updateRules";

    public static final String FUNC_VALIDTICKETCOUNTOF = "validTicketCountOf";

    public static final Event AGGREGATED_EVENT = new Event("Aggregated", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}));
    ;

    public static final Event AGREEMENTSRESET_EVENT = new Event("AgreementsReset", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}));
    ;

    public static final Event DEPOSITPAID_EVENT = new Event("DepositPaid", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Uint256>() {}));
    ;

    public static final Event DEPOSITRETURNED_EVENT = new Event("DepositReturned", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Uint256>() {}));
    ;

    public static final Event HALTED_EVENT = new Event("Halted", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}));
    ;

    public static final Event OPERATORROTATED_EVENT = new Event("OperatorRotated", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Address>(true) {}, new TypeReference<Address>(true) {}));
    ;

    public static final Event PAYOUTASSIGNED_EVENT = new Event("PayoutAssigned", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Uint8>(true) {}, new TypeReference<Address>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint256>() {}));
    ;

    public static final Event PURCHASED_EVENT = new Event("Purchased", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Bytes32>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Uint8>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint16>() {}));
    ;

    public static final Event REFUNDED_EVENT = new Event("Refunded", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Bytes32>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Uint8>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint16>() {}));
    ;

    public static final Event RELEASED_EVENT = new Event("Released", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Uint8>(true) {}, new TypeReference<Address>() {}, new TypeReference<Uint256>() {}));
    ;

    public static final Event ROLEADMINCHANGED_EVENT = new Event("RoleAdminChanged", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>(true) {}, new TypeReference<Bytes32>(true) {}, new TypeReference<Bytes32>(true) {}));
    ;

    public static final Event ROLEGRANTED_EVENT = new Event("RoleGranted", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Address>(true) {}));
    ;

    public static final Event ROLEREVOKED_EVENT = new Event("RoleRevoked", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Address>(true) {}));
    ;

    public static final Event RULESAGREED_EVENT = new Event("RulesAgreed", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Address>(true) {}, new TypeReference<Bytes32>() {}, new TypeReference<Uint8>() {}, new TypeReference<Uint8>() {}));
    ;

    public static final Event RULESUPDATED_EVENT = new Event("RulesUpdated", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Bytes32>() {}, new TypeReference<Uint16>() {}, new TypeReference<Uint16>() {}));
    ;

    public static final Event SALESTARTED_EVENT = new Event("SaleStarted", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<Bytes32>() {}));
    ;

    public static final Event SETTLEMENTLOCKED_EVENT = new Event("SettlementLocked", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}));
    ;

    public static final Event SHOWCREATED_EVENT = new Event("ShowCreated", 
            Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>(true) {}, new TypeReference<DynamicArray<Address>>() {}, new TypeReference<Uint8>() {}, new TypeReference<Bytes32>() {}, new TypeReference<Uint16>() {}, new TypeReference<Uint16>() {}, new TypeReference<Uint256>() {}));
    ;

    @Deprecated
    protected RevenueSplitter(String contractAddress, Web3j web3j, Credentials credentials, BigInteger gasPrice, BigInteger gasLimit) {
        super(BINARY, contractAddress, web3j, credentials, gasPrice, gasLimit);
    }

    protected RevenueSplitter(String contractAddress, Web3j web3j, Credentials credentials, ContractGasProvider contractGasProvider) {
        super(BINARY, contractAddress, web3j, credentials, contractGasProvider);
    }

    @Deprecated
    protected RevenueSplitter(String contractAddress, Web3j web3j, TransactionManager transactionManager, BigInteger gasPrice, BigInteger gasLimit) {
        super(BINARY, contractAddress, web3j, transactionManager, gasPrice, gasLimit);
    }

    protected RevenueSplitter(String contractAddress, Web3j web3j, TransactionManager transactionManager, ContractGasProvider contractGasProvider) {
        super(BINARY, contractAddress, web3j, transactionManager, contractGasProvider);
    }

    public static List<AggregatedEventResponse> getAggregatedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(AGGREGATED_EVENT, transactionReceipt);
        ArrayList<AggregatedEventResponse> responses = new ArrayList<AggregatedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            AggregatedEventResponse typedResponse = new AggregatedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.validTicketCount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.totalChoices = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.distributable = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            typedResponse.dust = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static AggregatedEventResponse getAggregatedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(AGGREGATED_EVENT, log);
        AggregatedEventResponse typedResponse = new AggregatedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.validTicketCount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.totalChoices = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.distributable = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        typedResponse.dust = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
        return typedResponse;
    }

    public Flowable<AggregatedEventResponse> aggregatedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getAggregatedEventFromLog(log));
    }

    public Flowable<AggregatedEventResponse> aggregatedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(AGGREGATED_EVENT));
        return aggregatedEventFlowable(filter);
    }

    public static List<AgreementsResetEventResponse> getAgreementsResetEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(AGREEMENTSRESET_EVENT, transactionReceipt);
        ArrayList<AgreementsResetEventResponse> responses = new ArrayList<AgreementsResetEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            AgreementsResetEventResponse typedResponse = new AgreementsResetEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static AgreementsResetEventResponse getAgreementsResetEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(AGREEMENTSRESET_EVENT, log);
        AgreementsResetEventResponse typedResponse = new AgreementsResetEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<AgreementsResetEventResponse> agreementsResetEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getAgreementsResetEventFromLog(log));
    }

    public Flowable<AgreementsResetEventResponse> agreementsResetEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(AGREEMENTSRESET_EVENT));
        return agreementsResetEventFlowable(filter);
    }

    public static List<DepositPaidEventResponse> getDepositPaidEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(DEPOSITPAID_EVENT, transactionReceipt);
        ArrayList<DepositPaidEventResponse> responses = new ArrayList<DepositPaidEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            DepositPaidEventResponse typedResponse = new DepositPaidEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.from = (String) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static DepositPaidEventResponse getDepositPaidEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(DEPOSITPAID_EVENT, log);
        DepositPaidEventResponse typedResponse = new DepositPaidEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.from = (String) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<DepositPaidEventResponse> depositPaidEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getDepositPaidEventFromLog(log));
    }

    public Flowable<DepositPaidEventResponse> depositPaidEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(DEPOSITPAID_EVENT));
        return depositPaidEventFlowable(filter);
    }

    public static List<DepositReturnedEventResponse> getDepositReturnedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(DEPOSITRETURNED_EVENT, transactionReceipt);
        ArrayList<DepositReturnedEventResponse> responses = new ArrayList<DepositReturnedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            DepositReturnedEventResponse typedResponse = new DepositReturnedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.to = (String) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static DepositReturnedEventResponse getDepositReturnedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(DEPOSITRETURNED_EVENT, log);
        DepositReturnedEventResponse typedResponse = new DepositReturnedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.to = (String) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<DepositReturnedEventResponse> depositReturnedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getDepositReturnedEventFromLog(log));
    }

    public Flowable<DepositReturnedEventResponse> depositReturnedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(DEPOSITRETURNED_EVENT));
        return depositReturnedEventFlowable(filter);
    }

    public static List<HaltedEventResponse> getHaltedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(HALTED_EVENT, transactionReceipt);
        ArrayList<HaltedEventResponse> responses = new ArrayList<HaltedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            HaltedEventResponse typedResponse = new HaltedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static HaltedEventResponse getHaltedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(HALTED_EVENT, log);
        HaltedEventResponse typedResponse = new HaltedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<HaltedEventResponse> haltedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getHaltedEventFromLog(log));
    }

    public Flowable<HaltedEventResponse> haltedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(HALTED_EVENT));
        return haltedEventFlowable(filter);
    }

    public static List<OperatorRotatedEventResponse> getOperatorRotatedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(OPERATORROTATED_EVENT, transactionReceipt);
        ArrayList<OperatorRotatedEventResponse> responses = new ArrayList<OperatorRotatedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            OperatorRotatedEventResponse typedResponse = new OperatorRotatedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.previousOperator = (String) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.newOperator = (String) eventValues.getIndexedValues().get(1).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static OperatorRotatedEventResponse getOperatorRotatedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(OPERATORROTATED_EVENT, log);
        OperatorRotatedEventResponse typedResponse = new OperatorRotatedEventResponse();
        typedResponse.log = log;
        typedResponse.previousOperator = (String) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.newOperator = (String) eventValues.getIndexedValues().get(1).getValue();
        return typedResponse;
    }

    public Flowable<OperatorRotatedEventResponse> operatorRotatedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getOperatorRotatedEventFromLog(log));
    }

    public Flowable<OperatorRotatedEventResponse> operatorRotatedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(OPERATORROTATED_EVENT));
        return operatorRotatedEventFlowable(filter);
    }

    public static List<PayoutAssignedEventResponse> getPayoutAssignedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(PAYOUTASSIGNED_EVENT, transactionReceipt);
        ArrayList<PayoutAssignedEventResponse> responses = new ArrayList<PayoutAssignedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            PayoutAssignedEventResponse typedResponse = new PayoutAssignedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.teamIndex = (BigInteger) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.team = (String) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.fixedPart = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.choicePart = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            typedResponse.dustPart = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
            typedResponse.total = (BigInteger) eventValues.getNonIndexedValues().get(4).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static PayoutAssignedEventResponse getPayoutAssignedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(PAYOUTASSIGNED_EVENT, log);
        PayoutAssignedEventResponse typedResponse = new PayoutAssignedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.teamIndex = (BigInteger) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.team = (String) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.fixedPart = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.choicePart = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        typedResponse.dustPart = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
        typedResponse.total = (BigInteger) eventValues.getNonIndexedValues().get(4).getValue();
        return typedResponse;
    }

    public Flowable<PayoutAssignedEventResponse> payoutAssignedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getPayoutAssignedEventFromLog(log));
    }

    public Flowable<PayoutAssignedEventResponse> payoutAssignedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(PAYOUTASSIGNED_EVENT));
        return payoutAssignedEventFlowable(filter);
    }

    public static List<PurchasedEventResponse> getPurchasedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(PURCHASED_EVENT, transactionReceipt);
        ArrayList<PurchasedEventResponse> responses = new ArrayList<PurchasedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            PurchasedEventResponse typedResponse = new PurchasedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.orderRef = (byte[]) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.buyer = (String) eventValues.getIndexedValues().get(2).getValue();
            typedResponse.teamIndex = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.quantity = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static PurchasedEventResponse getPurchasedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(PURCHASED_EVENT, log);
        PurchasedEventResponse typedResponse = new PurchasedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.orderRef = (byte[]) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.buyer = (String) eventValues.getIndexedValues().get(2).getValue();
        typedResponse.teamIndex = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.quantity = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<PurchasedEventResponse> purchasedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getPurchasedEventFromLog(log));
    }

    public Flowable<PurchasedEventResponse> purchasedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(PURCHASED_EVENT));
        return purchasedEventFlowable(filter);
    }

    public static List<RefundedEventResponse> getRefundedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(REFUNDED_EVENT, transactionReceipt);
        ArrayList<RefundedEventResponse> responses = new ArrayList<RefundedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RefundedEventResponse typedResponse = new RefundedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.orderRef = (byte[]) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.buyer = (String) eventValues.getIndexedValues().get(2).getValue();
            typedResponse.teamIndex = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.refundAmount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.quantity = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RefundedEventResponse getRefundedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(REFUNDED_EVENT, log);
        RefundedEventResponse typedResponse = new RefundedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.orderRef = (byte[]) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.buyer = (String) eventValues.getIndexedValues().get(2).getValue();
        typedResponse.teamIndex = (BigInteger) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.refundAmount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.quantity = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RefundedEventResponse> refundedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRefundedEventFromLog(log));
    }

    public Flowable<RefundedEventResponse> refundedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(REFUNDED_EVENT));
        return refundedEventFlowable(filter);
    }

    public static List<ReleasedEventResponse> getReleasedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(RELEASED_EVENT, transactionReceipt);
        ArrayList<ReleasedEventResponse> responses = new ArrayList<ReleasedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            ReleasedEventResponse typedResponse = new ReleasedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.teamIndex = (BigInteger) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.teamWallet = (String) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static ReleasedEventResponse getReleasedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(RELEASED_EVENT, log);
        ReleasedEventResponse typedResponse = new ReleasedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.teamIndex = (BigInteger) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.teamWallet = (String) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.amount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        return typedResponse;
    }

    public Flowable<ReleasedEventResponse> releasedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getReleasedEventFromLog(log));
    }

    public Flowable<ReleasedEventResponse> releasedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(RELEASED_EVENT));
        return releasedEventFlowable(filter);
    }

    public static List<RoleAdminChangedEventResponse> getRoleAdminChangedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(ROLEADMINCHANGED_EVENT, transactionReceipt);
        ArrayList<RoleAdminChangedEventResponse> responses = new ArrayList<RoleAdminChangedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RoleAdminChangedEventResponse typedResponse = new RoleAdminChangedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.previousAdminRole = (byte[]) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.newAdminRole = (byte[]) eventValues.getIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RoleAdminChangedEventResponse getRoleAdminChangedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(ROLEADMINCHANGED_EVENT, log);
        RoleAdminChangedEventResponse typedResponse = new RoleAdminChangedEventResponse();
        typedResponse.log = log;
        typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.previousAdminRole = (byte[]) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.newAdminRole = (byte[]) eventValues.getIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RoleAdminChangedEventResponse> roleAdminChangedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRoleAdminChangedEventFromLog(log));
    }

    public Flowable<RoleAdminChangedEventResponse> roleAdminChangedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(ROLEADMINCHANGED_EVENT));
        return roleAdminChangedEventFlowable(filter);
    }

    public static List<RoleGrantedEventResponse> getRoleGrantedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(ROLEGRANTED_EVENT, transactionReceipt);
        ArrayList<RoleGrantedEventResponse> responses = new ArrayList<RoleGrantedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RoleGrantedEventResponse typedResponse = new RoleGrantedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.account = (String) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.sender = (String) eventValues.getIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RoleGrantedEventResponse getRoleGrantedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(ROLEGRANTED_EVENT, log);
        RoleGrantedEventResponse typedResponse = new RoleGrantedEventResponse();
        typedResponse.log = log;
        typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.account = (String) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.sender = (String) eventValues.getIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RoleGrantedEventResponse> roleGrantedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRoleGrantedEventFromLog(log));
    }

    public Flowable<RoleGrantedEventResponse> roleGrantedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(ROLEGRANTED_EVENT));
        return roleGrantedEventFlowable(filter);
    }

    public static List<RoleRevokedEventResponse> getRoleRevokedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(ROLEREVOKED_EVENT, transactionReceipt);
        ArrayList<RoleRevokedEventResponse> responses = new ArrayList<RoleRevokedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RoleRevokedEventResponse typedResponse = new RoleRevokedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.account = (String) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.sender = (String) eventValues.getIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RoleRevokedEventResponse getRoleRevokedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(ROLEREVOKED_EVENT, log);
        RoleRevokedEventResponse typedResponse = new RoleRevokedEventResponse();
        typedResponse.log = log;
        typedResponse.role = (byte[]) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.account = (String) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.sender = (String) eventValues.getIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RoleRevokedEventResponse> roleRevokedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRoleRevokedEventFromLog(log));
    }

    public Flowable<RoleRevokedEventResponse> roleRevokedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(ROLEREVOKED_EVENT));
        return roleRevokedEventFlowable(filter);
    }

    public static List<RulesAgreedEventResponse> getRulesAgreedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(RULESAGREED_EVENT, transactionReceipt);
        ArrayList<RulesAgreedEventResponse> responses = new ArrayList<RulesAgreedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RulesAgreedEventResponse typedResponse = new RulesAgreedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.team = (String) eventValues.getIndexedValues().get(1).getValue();
            typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.agreedCount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.teamCount = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RulesAgreedEventResponse getRulesAgreedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(RULESAGREED_EVENT, log);
        RulesAgreedEventResponse typedResponse = new RulesAgreedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.team = (String) eventValues.getIndexedValues().get(1).getValue();
        typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.agreedCount = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.teamCount = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RulesAgreedEventResponse> rulesAgreedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRulesAgreedEventFromLog(log));
    }

    public Flowable<RulesAgreedEventResponse> rulesAgreedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(RULESAGREED_EVENT));
        return rulesAgreedEventFlowable(filter);
    }

    public static List<RulesUpdatedEventResponse> getRulesUpdatedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(RULESUPDATED_EVENT, transactionReceipt);
        ArrayList<RulesUpdatedEventResponse> responses = new ArrayList<RulesUpdatedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            RulesUpdatedEventResponse typedResponse = new RulesUpdatedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
            typedResponse.fixedRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.selectionRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static RulesUpdatedEventResponse getRulesUpdatedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(RULESUPDATED_EVENT, log);
        RulesUpdatedEventResponse typedResponse = new RulesUpdatedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
        typedResponse.fixedRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.selectionRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(2).getValue();
        return typedResponse;
    }

    public Flowable<RulesUpdatedEventResponse> rulesUpdatedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getRulesUpdatedEventFromLog(log));
    }

    public Flowable<RulesUpdatedEventResponse> rulesUpdatedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(RULESUPDATED_EVENT));
        return rulesUpdatedEventFlowable(filter);
    }

    public static List<SaleStartedEventResponse> getSaleStartedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(SALESTARTED_EVENT, transactionReceipt);
        ArrayList<SaleStartedEventResponse> responses = new ArrayList<SaleStartedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            SaleStartedEventResponse typedResponse = new SaleStartedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static SaleStartedEventResponse getSaleStartedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(SALESTARTED_EVENT, log);
        SaleStartedEventResponse typedResponse = new SaleStartedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<SaleStartedEventResponse> saleStartedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getSaleStartedEventFromLog(log));
    }

    public Flowable<SaleStartedEventResponse> saleStartedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(SALESTARTED_EVENT));
        return saleStartedEventFlowable(filter);
    }

    public static List<SettlementLockedEventResponse> getSettlementLockedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(SETTLEMENTLOCKED_EVENT, transactionReceipt);
        ArrayList<SettlementLockedEventResponse> responses = new ArrayList<SettlementLockedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            SettlementLockedEventResponse typedResponse = new SettlementLockedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static SettlementLockedEventResponse getSettlementLockedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(SETTLEMENTLOCKED_EVENT, log);
        SettlementLockedEventResponse typedResponse = new SettlementLockedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        return typedResponse;
    }

    public Flowable<SettlementLockedEventResponse> settlementLockedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getSettlementLockedEventFromLog(log));
    }

    public Flowable<SettlementLockedEventResponse> settlementLockedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(SETTLEMENTLOCKED_EVENT));
        return settlementLockedEventFlowable(filter);
    }

    public static List<ShowCreatedEventResponse> getShowCreatedEvents(TransactionReceipt transactionReceipt) {
        List<Contract.EventValuesWithLog> valueList = staticExtractEventParametersWithLog(SHOWCREATED_EVENT, transactionReceipt);
        ArrayList<ShowCreatedEventResponse> responses = new ArrayList<ShowCreatedEventResponse>(valueList.size());
        for (Contract.EventValuesWithLog eventValues : valueList) {
            ShowCreatedEventResponse typedResponse = new ShowCreatedEventResponse();
            typedResponse.log = eventValues.getLog();
            typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
            typedResponse.teamWallets = (List<String>) ((Array) eventValues.getNonIndexedValues().get(0)).getNativeValueCopy();
            typedResponse.hostTeamIndex = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
            typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(2).getValue();
            typedResponse.fixedRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
            typedResponse.selectionRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(4).getValue();
            typedResponse.depositAmount = (BigInteger) eventValues.getNonIndexedValues().get(5).getValue();
            responses.add(typedResponse);
        }
        return responses;
    }

    public static ShowCreatedEventResponse getShowCreatedEventFromLog(Log log) {
        Contract.EventValuesWithLog eventValues = staticExtractEventParametersWithLog(SHOWCREATED_EVENT, log);
        ShowCreatedEventResponse typedResponse = new ShowCreatedEventResponse();
        typedResponse.log = log;
        typedResponse.showId = (BigInteger) eventValues.getIndexedValues().get(0).getValue();
        typedResponse.teamWallets = (List<String>) ((Array) eventValues.getNonIndexedValues().get(0)).getNativeValueCopy();
        typedResponse.hostTeamIndex = (BigInteger) eventValues.getNonIndexedValues().get(1).getValue();
        typedResponse.rulesHash = (byte[]) eventValues.getNonIndexedValues().get(2).getValue();
        typedResponse.fixedRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(3).getValue();
        typedResponse.selectionRatioBp = (BigInteger) eventValues.getNonIndexedValues().get(4).getValue();
        typedResponse.depositAmount = (BigInteger) eventValues.getNonIndexedValues().get(5).getValue();
        return typedResponse;
    }

    public Flowable<ShowCreatedEventResponse> showCreatedEventFlowable(EthFilter filter) {
        return web3j.ethLogFlowable(filter).map(log -> getShowCreatedEventFromLog(log));
    }

    public Flowable<ShowCreatedEventResponse> showCreatedEventFlowable(DefaultBlockParameter startBlock, DefaultBlockParameter endBlock) {
        EthFilter filter = new EthFilter(startBlock, endBlock, getContractAddress());
        filter.addSingleTopic(EventEncoder.encode(SHOWCREATED_EVENT));
        return showCreatedEventFlowable(filter);
    }

    public RemoteFunctionCall<BigInteger> BP() {
        final Function function = new Function(FUNC_BP, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint16>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<byte[]> DEFAULT_ADMIN_ROLE() {
        final Function function = new Function(FUNC_DEFAULT_ADMIN_ROLE, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>() {}));
        return executeRemoteCallSingleValueReturn(function, byte[].class);
    }

    public RemoteFunctionCall<BigInteger> MAX_QUANTITY_PER_ORDER() {
        final Function function = new Function(FUNC_MAX_QUANTITY_PER_ORDER, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint16>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<BigInteger> MAX_TEAMS() {
        final Function function = new Function(FUNC_MAX_TEAMS, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint8>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<byte[]> OPERATOR_ROLE() {
        final Function function = new Function(FUNC_OPERATOR_ROLE, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>() {}));
        return executeRemoteCallSingleValueReturn(function, byte[].class);
    }

    public RemoteFunctionCall<TransactionReceipt> aggregate(BigInteger showId, BigInteger validTicketCount) {
        final Function function = new Function(
                FUNC_AGGREGATE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Uint256(validTicketCount)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<TransactionReceipt> agreeToRules(BigInteger showId, byte[] rulesHash) {
        final Function function = new Function(
                FUNC_AGREETORULES, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Bytes32(rulesHash)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<BigInteger> agreedCountOf(BigInteger showId) {
        final Function function = new Function(FUNC_AGREEDCOUNTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint8>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<Boolean> agreedOf(BigInteger showId, String wallet) {
        final Function function = new Function(FUNC_AGREEDOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.Address(160, wallet)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bool>() {}));
        return executeRemoteCallSingleValueReturn(function, Boolean.class);
    }

    public RemoteFunctionCall<BigInteger> choiceCountOf(BigInteger showId, BigInteger teamIndex) {
        final Function function = new Function(FUNC_CHOICECOUNTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Uint8(teamIndex)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<List> choiceCountsOf(BigInteger showId) {
        final Function function = new Function(FUNC_CHOICECOUNTSOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<DynamicArray<Uint256>>() {}));
        return new RemoteFunctionCall<List>(function,
                new Callable<List>() {
                    @Override
                    @SuppressWarnings("unchecked")
                    public List call() throws Exception {
                        List<Type> result = (List<Type>) executeCallSingleValueReturn(function, List.class);
                        return convertToNative(result);
                    }
                });
    }

    public RemoteFunctionCall<TransactionReceipt> createShow(BigInteger showId, List<String> teamWallets, BigInteger hostTeamIndex, byte[] rulesHash, BigInteger fixedRatioBp, BigInteger selectionRatioBp, List<BigInteger> teamShareBp, BigInteger depositAmount) {
        final Function function = new Function(
                FUNC_CREATESHOW, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.DynamicArray<org.web3j.abi.datatypes.Address>(
                        org.web3j.abi.datatypes.Address.class,
                        org.web3j.abi.Utils.typeMap(teamWallets, org.web3j.abi.datatypes.Address.class)), 
                new org.web3j.abi.datatypes.generated.Uint8(hostTeamIndex), 
                new org.web3j.abi.datatypes.generated.Bytes32(rulesHash), 
                new org.web3j.abi.datatypes.generated.Uint16(fixedRatioBp), 
                new org.web3j.abi.datatypes.generated.Uint16(selectionRatioBp), 
                new org.web3j.abi.datatypes.DynamicArray<org.web3j.abi.datatypes.generated.Uint16>(
                        org.web3j.abi.datatypes.generated.Uint16.class,
                        org.web3j.abi.Utils.typeMap(teamShareBp, org.web3j.abi.datatypes.generated.Uint16.class)), 
                new org.web3j.abi.datatypes.generated.Uint256(depositAmount)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<TransactionReceipt> deposit(BigInteger showId) {
        final Function function = new Function(
                FUNC_DEPOSIT, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<BigInteger> depositAmountOf(BigInteger showId) {
        final Function function = new Function(FUNC_DEPOSITAMOUNTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<BigInteger> depositOf(BigInteger showId) {
        final Function function = new Function(FUNC_DEPOSITOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<BigInteger> escrowOf(BigInteger showId) {
        final Function function = new Function(FUNC_ESCROWOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<TransactionReceipt> forfeitDeposit(BigInteger showId) {
        final Function function = new Function(
                FUNC_FORFEITDEPOSIT, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<byte[]> getRoleAdmin(byte[] role) {
        final Function function = new Function(FUNC_GETROLEADMIN, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Bytes32(role)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>() {}));
        return executeRemoteCallSingleValueReturn(function, byte[].class);
    }

    public RemoteFunctionCall<TransactionReceipt> halt(BigInteger showId) {
        final Function function = new Function(
                FUNC_HALT, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<Boolean> hasRole(byte[] role, String account) {
        final Function function = new Function(FUNC_HASROLE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Bytes32(role), 
                new org.web3j.abi.datatypes.Address(160, account)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bool>() {}));
        return executeRemoteCallSingleValueReturn(function, Boolean.class);
    }

    public RemoteFunctionCall<BigInteger> hostTeamIndexOf(BigInteger showId) {
        final Function function = new Function(FUNC_HOSTTEAMINDEXOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint8>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<TransactionReceipt> lock(BigInteger showId) {
        final Function function = new Function(
                FUNC_LOCK, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<String> operator() {
        final Function function = new Function(FUNC_OPERATOR, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Address>() {}));
        return executeRemoteCallSingleValueReturn(function, String.class);
    }

    public RemoteFunctionCall<BigInteger> payoutOf(BigInteger showId, BigInteger teamIndex) {
        final Function function = new Function(FUNC_PAYOUTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Uint8(teamIndex)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<List> payoutsOf(BigInteger showId) {
        final Function function = new Function(FUNC_PAYOUTSOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<DynamicArray<Uint256>>() {}));
        return new RemoteFunctionCall<List>(function,
                new Callable<List>() {
                    @Override
                    @SuppressWarnings("unchecked")
                    public List call() throws Exception {
                        List<Type> result = (List<Type>) executeCallSingleValueReturn(function, List.class);
                        return convertToNative(result);
                    }
                });
    }

    public RemoteFunctionCall<TransactionReceipt> purchase(BigInteger showId, byte[] orderRef, BigInteger teamIndex, BigInteger amount, BigInteger quantity) {
        final Function function = new Function(
                FUNC_PURCHASE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Bytes32(orderRef), 
                new org.web3j.abi.datatypes.generated.Uint8(teamIndex), 
                new org.web3j.abi.datatypes.generated.Uint256(amount), 
                new org.web3j.abi.datatypes.generated.Uint16(quantity)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<Tuple5<String, BigInteger, BigInteger, BigInteger, BigInteger>> purchaseOf(BigInteger showId, byte[] orderRef) {
        final Function function = new Function(FUNC_PURCHASEOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Bytes32(orderRef)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Address>() {}, new TypeReference<Uint8>() {}, new TypeReference<Uint256>() {}, new TypeReference<Uint16>() {}, new TypeReference<Uint256>() {}));
        return new RemoteFunctionCall<Tuple5<String, BigInteger, BigInteger, BigInteger, BigInteger>>(function,
                new Callable<Tuple5<String, BigInteger, BigInteger, BigInteger, BigInteger>>() {
                    @Override
                    public Tuple5<String, BigInteger, BigInteger, BigInteger, BigInteger> call() throws Exception {
                        List<Type> results = executeCallMultipleValueReturn(function);
                        return new Tuple5<String, BigInteger, BigInteger, BigInteger, BigInteger>(
                                (String) results.get(0).getValue(), 
                                (BigInteger) results.get(1).getValue(), 
                                (BigInteger) results.get(2).getValue(), 
                                (BigInteger) results.get(3).getValue(), 
                                (BigInteger) results.get(4).getValue());
                    }
                });
    }

    public RemoteFunctionCall<TransactionReceipt> refund(BigInteger showId, byte[] orderRef, BigInteger refundAmount) {
        final Function function = new Function(
                FUNC_REFUND, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Bytes32(orderRef), 
                new org.web3j.abi.datatypes.generated.Uint256(refundAmount)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<TransactionReceipt> release(BigInteger showId) {
        final Function function = new Function(
                FUNC_RELEASE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<TransactionReceipt> returnDeposit(BigInteger showId) {
        final Function function = new Function(
                FUNC_RETURNDEPOSIT, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<TransactionReceipt> rotateOperator(String next) {
        final Function function = new Function(
                FUNC_ROTATEOPERATOR, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.Address(160, next)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<byte[]> rulesHashOf(BigInteger showId) {
        final Function function = new Function(FUNC_RULESHASHOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bytes32>() {}));
        return executeRemoteCallSingleValueReturn(function, byte[].class);
    }

    public RemoteFunctionCall<Tuple3<BigInteger, BigInteger, List<BigInteger>>> rulesOf(BigInteger showId) {
        final Function function = new Function(FUNC_RULESOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint16>() {}, new TypeReference<Uint16>() {}, new TypeReference<DynamicArray<Uint16>>() {}));
        return new RemoteFunctionCall<Tuple3<BigInteger, BigInteger, List<BigInteger>>>(function,
                new Callable<Tuple3<BigInteger, BigInteger, List<BigInteger>>>() {
                    @Override
                    public Tuple3<BigInteger, BigInteger, List<BigInteger>> call() throws Exception {
                        List<Type> results = executeCallMultipleValueReturn(function);
                        return new Tuple3<BigInteger, BigInteger, List<BigInteger>>(
                                (BigInteger) results.get(0).getValue(), 
                                (BigInteger) results.get(1).getValue(), 
                                convertToNative((List<Uint16>) results.get(2).getValue()));
                    }
                });
    }

    public RemoteFunctionCall<BigInteger> stageOf(BigInteger showId) {
        final Function function = new Function(FUNC_STAGEOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint8>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<TransactionReceipt> startSale(BigInteger showId) {
        final Function function = new Function(
                FUNC_STARTSALE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<Boolean> supportsInterface(byte[] interfaceId) {
        final Function function = new Function(FUNC_SUPPORTSINTERFACE, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Bytes4(interfaceId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Bool>() {}));
        return executeRemoteCallSingleValueReturn(function, Boolean.class);
    }

    public RemoteFunctionCall<BigInteger> teamCountOf(BigInteger showId) {
        final Function function = new Function(FUNC_TEAMCOUNTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint8>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<List> teamWalletsOf(BigInteger showId) {
        final Function function = new Function(FUNC_TEAMWALLETSOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<DynamicArray<Address>>() {}));
        return new RemoteFunctionCall<List>(function,
                new Callable<List>() {
                    @Override
                    @SuppressWarnings("unchecked")
                    public List call() throws Exception {
                        List<Type> result = (List<Type>) executeCallSingleValueReturn(function, List.class);
                        return convertToNative(result);
                    }
                });
    }

    public RemoteFunctionCall<String> token() {
        final Function function = new Function(FUNC_TOKEN, 
                Arrays.<Type>asList(), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Address>() {}));
        return executeRemoteCallSingleValueReturn(function, String.class);
    }

    public RemoteFunctionCall<BigInteger> totalChoicesOf(BigInteger showId) {
        final Function function = new Function(FUNC_TOTALCHOICESOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    public RemoteFunctionCall<TransactionReceipt> updateRules(BigInteger showId, byte[] rulesHash, BigInteger fixedRatioBp, BigInteger selectionRatioBp, List<BigInteger> teamShareBp) {
        final Function function = new Function(
                FUNC_UPDATERULES, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId), 
                new org.web3j.abi.datatypes.generated.Bytes32(rulesHash), 
                new org.web3j.abi.datatypes.generated.Uint16(fixedRatioBp), 
                new org.web3j.abi.datatypes.generated.Uint16(selectionRatioBp), 
                new org.web3j.abi.datatypes.DynamicArray<org.web3j.abi.datatypes.generated.Uint16>(
                        org.web3j.abi.datatypes.generated.Uint16.class,
                        org.web3j.abi.Utils.typeMap(teamShareBp, org.web3j.abi.datatypes.generated.Uint16.class))), 
                Collections.<TypeReference<?>>emptyList());
        return executeRemoteCallTransaction(function);
    }

    public RemoteFunctionCall<BigInteger> validTicketCountOf(BigInteger showId) {
        final Function function = new Function(FUNC_VALIDTICKETCOUNTOF, 
                Arrays.<Type>asList(new org.web3j.abi.datatypes.generated.Uint256(showId)), 
                Arrays.<TypeReference<?>>asList(new TypeReference<Uint256>() {}));
        return executeRemoteCallSingleValueReturn(function, BigInteger.class);
    }

    @Deprecated
    public static RevenueSplitter load(String contractAddress, Web3j web3j, Credentials credentials, BigInteger gasPrice, BigInteger gasLimit) {
        return new RevenueSplitter(contractAddress, web3j, credentials, gasPrice, gasLimit);
    }

    @Deprecated
    public static RevenueSplitter load(String contractAddress, Web3j web3j, TransactionManager transactionManager, BigInteger gasPrice, BigInteger gasLimit) {
        return new RevenueSplitter(contractAddress, web3j, transactionManager, gasPrice, gasLimit);
    }

    public static RevenueSplitter load(String contractAddress, Web3j web3j, Credentials credentials, ContractGasProvider contractGasProvider) {
        return new RevenueSplitter(contractAddress, web3j, credentials, contractGasProvider);
    }

    public static RevenueSplitter load(String contractAddress, Web3j web3j, TransactionManager transactionManager, ContractGasProvider contractGasProvider) {
        return new RevenueSplitter(contractAddress, web3j, transactionManager, contractGasProvider);
    }

    public static class AggregatedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public BigInteger validTicketCount;

        public BigInteger totalChoices;

        public BigInteger distributable;

        public BigInteger dust;
    }

    public static class AgreementsResetEventResponse extends BaseEventResponse {
        public BigInteger showId;
    }

    public static class DepositPaidEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public String from;

        public BigInteger amount;
    }

    public static class DepositReturnedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public String to;

        public BigInteger amount;
    }

    public static class HaltedEventResponse extends BaseEventResponse {
        public BigInteger showId;
    }

    public static class OperatorRotatedEventResponse extends BaseEventResponse {
        public String previousOperator;

        public String newOperator;
    }

    public static class PayoutAssignedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public BigInteger teamIndex;

        public String team;

        public BigInteger fixedPart;

        public BigInteger choicePart;

        public BigInteger dustPart;

        public BigInteger total;
    }

    public static class PurchasedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public byte[] orderRef;

        public String buyer;

        public BigInteger teamIndex;

        public BigInteger amount;

        public BigInteger quantity;
    }

    public static class RefundedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public byte[] orderRef;

        public String buyer;

        public BigInteger teamIndex;

        public BigInteger refundAmount;

        public BigInteger quantity;
    }

    public static class ReleasedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public BigInteger teamIndex;

        public String teamWallet;

        public BigInteger amount;
    }

    public static class RoleAdminChangedEventResponse extends BaseEventResponse {
        public byte[] role;

        public byte[] previousAdminRole;

        public byte[] newAdminRole;
    }

    public static class RoleGrantedEventResponse extends BaseEventResponse {
        public byte[] role;

        public String account;

        public String sender;
    }

    public static class RoleRevokedEventResponse extends BaseEventResponse {
        public byte[] role;

        public String account;

        public String sender;
    }

    public static class RulesAgreedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public String team;

        public byte[] rulesHash;

        public BigInteger agreedCount;

        public BigInteger teamCount;
    }

    public static class RulesUpdatedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public byte[] rulesHash;

        public BigInteger fixedRatioBp;

        public BigInteger selectionRatioBp;
    }

    public static class SaleStartedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public byte[] rulesHash;
    }

    public static class SettlementLockedEventResponse extends BaseEventResponse {
        public BigInteger showId;
    }

    public static class ShowCreatedEventResponse extends BaseEventResponse {
        public BigInteger showId;

        public List<String> teamWallets;

        public BigInteger hostTeamIndex;

        public byte[] rulesHash;

        public BigInteger fixedRatioBp;

        public BigInteger selectionRatioBp;

        public BigInteger depositAmount;
    }
}
