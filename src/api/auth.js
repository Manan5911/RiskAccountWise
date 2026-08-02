// src/api/auth.js
import axios from 'axios';
import { environment } from '../environments/environment';

export const loginApi = async (username, password) => {
    const response = await axios.post(
        `${environment.baseUrl}GetLogin_BoUserMappings2/`, // Note the trailing slash
        {
            BoUser: username,
            password: password,
            Token: null, // As per your requirement
        },
        {
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );

    const result = response.data.GetLogin_BoUserMappings2Result[0];
    if (!result) throw new Error("Invalid credentials");

    return {
        user: result.BoUserName,
        role: result.Role,
        token: result.Token,
        rolesList: result.RolesList,
    };
};

export const trackLogin = async (user) => {
    try {
        await axios.post(
            `${environment.baseUrl}AddUserLoginInfo`,
            {
                user: user,
                message: "User logged in",
            },
            {
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (err) {
        console.error("Failed to track login:", err);
        // Silently fail (non-critical)
    }
};

// User profile API
export const getUserProfile = async (user, port) => {
  const token = sessionStorage.getItem('x-auth-token');
  try {
    const response = await axios.post(
      `${environment.baseUrl}GetUserProfiling`,
      {
        bouser: user,
        port: port,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${token}`,
        },
      }
    );
    const data = response.data;
    return data.getUserProfilingResult ? JSON.parse(data.getUserProfilingResult) : [];
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    throw err;
  }
};

export const editUserProfile = async (port, profileName, profileValue) => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  // console.log('editUserProfile payload:', { bouser: loginUser, port, profileName, profileValue: profileValue?.substring(0, 100) });
  const response = await axios.post(
    `${environment.baseUrl}EditUserProfiling`,
    {
      bouser: loginUser,
      port,
      profileName,
      profileValue,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Exchange and Currency APIs
export const getExchCtclAccList = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginuser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}getExchCtclAccountMappping`,
    { bouser: loginuser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  // console.log("getExchCtclAccList response:", response.data);
  return response.data;
};

export const getExchangeCurrency = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}GetExchangeCurrency`,
    {
      headers: {
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const getCurrencyPrice = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}GetCurrencyConversionPrice`,
    {
      headers: {
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Open Prices API
export const getOpenPrices = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetOpenPrice`,
    { user: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Close Prices API
export const getClosePrices = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetClosePrice`,
    { user: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Margin Risk API
export const getMargins = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}GetMarginRisk`,
    {
      headers: {
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// All trades API
export const getAllTrades = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetCombinedTradeDataForMobile`,
    { BoUser: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// LTP API
export const getLTP = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetLTP`,
    { user: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Mapped Users API
export const getMappedUsers = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetMappedUsers`,
    { BoUser: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

// Customer Account Mappings API
export const getCustomerAccountMappings = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}GetCustomerAccountMappings`,
    {
      headers: {
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const getReferenceRate = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const loginUser = sessionStorage.getItem('UserName');
  const response = await axios.post(
    `${environment.baseUrl}GetReferenceRate`,
    { User: loginUser },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const getCurrentSpanMargin = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}GetCurrentSpanMargin/`,
    {
      headers: {
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const getMarginFromUser = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.post(
    `${environment.baseUrl}GetAssignedMargin/`,
    { type: 'User' },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const subscribeForLTP = async (securityId, exch) => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.post(
    `${environment.baseUrl}subscribeForLTP/`,
    { securityId, exch },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};

export const getCommonSubscription = async () => {
  const token = sessionStorage.getItem('x-auth-token');
  const response = await axios.get(
    `${environment.baseUrl}getsubscriptions/`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${token}`,
      },
    }
  );
  return response.data;
};